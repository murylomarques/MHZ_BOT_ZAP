import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";
import { writeAudit } from "@/lib/server/auth/audit";
import { getConversationalProvider } from "@/lib/server/providers";
import { transitionCase, InvalidTransitionError } from "@/lib/server/status/transitions";

export const maxDuration = 60;

// Executa uma rodada de disparo real: pega até `maxSendPerRun` itens PENDENTE
// da campanha (nunca reenvia um item já ENVIADO — a condição WHERE status:
// PENDENTE garante isso mesmo se a rota for chamada concorrentemente/
// repetidamente) e envia o template pela Graph API (Meta WhatsApp) para cada
// um. Usa o mesmo provedor do canal conversacional porque o canal de disparo
// em massa dedicado (Matrix Desktop) ainda não tem integração real — ver
// lib/server/providers/matrix-desktop-provider.ts.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("campaigns_manage");
    const { id: campaignId } = await params;

    const campaign = await prisma.botCampaign.findUnique({
      where: { id: campaignId },
      include: { template: true },
    });
    if (!campaign) {
      return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });
    }
    if (campaign.status !== "EM_EXECUCAO") {
      return NextResponse.json(
        { error: "Campanha precisa estar EM_EXECUCAO para disparar" },
        { status: 400 }
      );
    }
    if (!campaign.template) {
      return NextResponse.json({ error: "Campanha sem template configurado" }, { status: 400 });
    }

    const take = campaign.maxSendPerRun ?? 50;
    const items = await prisma.botCampaignItem.findMany({
      where: { campaignId, status: "PENDENTE" },
      orderBy: { id: "asc" },
      take,
    });

    if (items.length === 0) {
      return NextResponse.json({ sent: 0, failed: 0 });
    }

    const cases = await prisma.caseRecord.findMany({
      where: { id: { in: items.map((i) => i.caseId) } },
      include: { serviceOrder: { include: { customer: true } } },
    });
    const caseMap = new Map(cases.map((c) => [c.id, c]));

    const provider = getConversationalProvider();
    const templateName = campaign.template.hsmCode ?? campaign.template.flowCode ?? campaign.template.internalName;
    const templateVariables = Array.isArray(campaign.template.variables)
      ? (campaign.template.variables as string[])
      : [];

    let sent = 0;
    let failed = 0;

    for (const item of items) {
      const caseRecord = caseMap.get(item.caseId);
      if (!caseRecord) {
        // Caso não encontrado (excluído?) — marca item como erro para não travar a fila.
        await prisma.botCampaignItem.update({
          where: { id: item.id },
          data: { status: "ERRO", attempts: { increment: 1 } },
        });
        failed++;
        continue;
      }

      const customer = caseRecord.serviceOrder.customer;
      const variables: Record<string, string> = {};
      if (templateVariables.includes("nome")) variables.nome = customer.name;

      const result = await provider.sendTemplate({
        to: customer.phone,
        templateName,
        languageCode: "pt_BR",
        variables,
      });

      if (result.success) {
        await prisma.$transaction([
          prisma.botMessage.create({
            data: {
              caseId: caseRecord.id,
              campaignId,
              provider: "meta_whatsapp",
              externalId: result.externalId,
              status: "ENVIADO",
              sentAt: new Date(),
            },
          }),
          prisma.botCampaignItem.update({
            where: { id: item.id },
            data: { status: "ENVIADO" },
          }),
        ]);

        try {
          if (caseRecord.status === "PENDENTE_DISPARO") {
            await transitionCase({
              caseId: caseRecord.id,
              to: "PROCESSANDO_DISPARO",
              origin: "BOT",
            });
          }
          const refreshed = await prisma.caseRecord.findUnique({ where: { id: caseRecord.id } });
          if (refreshed?.status === "PROCESSANDO_DISPARO") {
            await transitionCase({
              caseId: caseRecord.id,
              to: "MENSAGEM_ENVIADA",
              origin: "BOT",
            });
          }
        } catch (transitionErr) {
          if (!(transitionErr instanceof InvalidTransitionError)) throw transitionErr;
          // Caso já avançou por outro caminho (ex.: resposta concorrente do
          // cliente) — não é um erro de disparo, apenas ignora o avanço de status.
        }

        sent++;
      } else {
        await prisma.$transaction([
          prisma.botMessage.create({
            data: {
              caseId: caseRecord.id,
              campaignId,
              provider: "meta_whatsapp",
              status: "ERRO",
              errorCode: result.errorCode,
              errorMessage: result.errorMessage,
            },
          }),
          prisma.botCampaignItem.update({
            where: { id: item.id },
            data: { status: "ERRO", attempts: { increment: 1 } },
          }),
        ]);
        failed++;
      }
    }

    await writeAudit({
      userId: session.sub,
      action: "bot_campaign_dispatch",
      entity: "bot_campaigns",
      entityId: campaignId,
      afterData: { sent, failed },
      origin: "web",
    });

    return NextResponse.json({ sent, failed });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao disparar campanha" },
      { status: 500 }
    );
  }
}
