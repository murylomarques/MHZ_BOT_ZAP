import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";
import { writeAudit } from "@/lib/server/auth/audit";
import { getConversationalProvider } from "@/lib/server/providers";

export const maxDuration = 300;

// Reenvia o template inicial (já traz os botões de motivo embutidos) pros
// casos presos em CLIENTE_RESPONDEU — clicaram no primeiro contato mas
// nunca completaram nem a retenção nem o agendamento da retirada. Não
// cria caso novo (diferente de /api/bot/manual-dispatch): usa o case_record
// já existente e só registra a nova mensagem + uma nota.
const NUDGE_TEMPLATE_NAME = "msg_inicial_v1";
const DELAY_MS = 400; // espaçamento entre envios, mesmo padrão do disparo em massa

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST() {
  try {
    const session = await requirePermission("campaigns_manage");
    const provider = getConversationalProvider();

    const cases = await prisma.caseRecord.findMany({
      where: { status: "CLIENTE_RESPONDEU" },
      include: { serviceOrder: { include: { customer: true } } },
    });

    const results: { caseId: string; phone: string; sent: boolean; error?: string }[] = [];

    for (const caseRecord of cases) {
      const phone = caseRecord.serviceOrder.customer.phone;
      try {
        const sendResult = await provider.sendTemplate({
          to: phone,
          templateName: NUDGE_TEMPLATE_NAME,
          languageCode: "pt_BR",
        });

        if (sendResult.success) {
          await prisma.$transaction([
            prisma.botMessage.create({
              data: {
                caseId: caseRecord.id,
                provider: "meta_whatsapp",
                externalId: sendResult.externalId,
                status: "ENVIADO",
                sentAt: new Date(),
              },
            }),
            prisma.caseNote.create({
              data: {
                caseId: caseRecord.id,
                body: "Lembrete enviado: cliente respondeu ao primeiro contato mas não completou o agendamento/retenção.",
                userId: session.sub,
              },
            }),
          ]);
          results.push({ caseId: caseRecord.id, phone, sent: true });
        } else {
          await prisma.botMessage.create({
            data: {
              caseId: caseRecord.id,
              provider: "meta_whatsapp",
              status: "ERRO",
              errorCode: sendResult.errorCode,
              errorMessage: sendResult.errorMessage,
            },
          });
          results.push({ caseId: caseRecord.id, phone, sent: false, error: sendResult.errorMessage });
        }
      } catch (err) {
        results.push({ caseId: caseRecord.id, phone, sent: false, error: err instanceof Error ? err.message : "Erro" });
      }
      await sleep(DELAY_MS);
    }

    const summary = {
      total: results.length,
      enviados: results.filter((r) => r.sent).length,
      erros: results.filter((r) => !r.sent).length,
    };

    await writeAudit({
      userId: session.sub,
      action: "nudge_responded",
      entity: "case_records",
      afterData: { summary, results },
      origin: "web",
    });

    return NextResponse.json({ summary, results });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao enviar lembretes" },
      { status: 500 }
    );
  }
}
