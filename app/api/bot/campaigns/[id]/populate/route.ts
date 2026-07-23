import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";
import { writeAudit } from "@/lib/server/auth/audit";

// "Adicionar clientes à fila": seleciona CaseRecord ainda não vinculados a
// nenhuma campanha (campaignId null), com status PENDENTE_DISPARO e cidade
// dentro da lista configurada na campanha, cria os BotCampaignItem (fila) e
// marca o caso como pertencente a esta campanha.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("campaigns_manage");
    const { id: campaignId } = await params;

    const campaign = await prisma.botCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) {
      return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });
    }
    if (campaign.cities.length === 0) {
      return NextResponse.json(
        { error: "Campanha não tem cidades configuradas" },
        { status: 400 }
      );
    }

    const eligibleCases = await prisma.caseRecord.findMany({
      where: {
        status: "PENDENTE_DISPARO",
        campaignId: null,
        serviceOrder: { customer: { city: { in: campaign.cities } } },
      },
      select: { id: true },
    });

    if (eligibleCases.length === 0) {
      return NextResponse.json({ added: 0 });
    }

    const caseIds = eligibleCases.map((c) => c.id);

    await prisma.$transaction([
      prisma.botCampaignItem.createMany({
        data: caseIds.map((caseId) => ({ campaignId, caseId, status: "PENDENTE" })),
        skipDuplicates: true,
      }),
      prisma.caseRecord.updateMany({
        where: { id: { in: caseIds } },
        data: { campaignId },
      }),
    ]);

    await writeAudit({
      userId: session.sub,
      action: "bot_campaign_populate",
      entity: "bot_campaigns",
      entityId: campaignId,
      afterData: { added: caseIds.length },
      origin: "web",
    });

    return NextResponse.json({ added: caseIds.length });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao adicionar clientes" },
      { status: 500 }
    );
  }
}
