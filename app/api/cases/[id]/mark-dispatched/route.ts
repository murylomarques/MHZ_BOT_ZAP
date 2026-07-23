import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";
import { writeAudit } from "@/lib/server/auth/audit";
import type { CaseStatus } from "@prisma/client";

const bodySchema = z.object({
  courierName: z.string().min(1),
  note: z.string().optional(),
});

// Atalho manual pro atendente marcar "já saiu com o motoboy" sem passar pelo
// fluxo formal de Mapa e Rotas (que exige endereço geocodificado e otimização
// de rota) — o fluxo de rotas ainda não cobre todos os casos, então isso
// serve como registro rápido de status enquanto ele não estiver completo.
// Segue o mesmo padrão de /api/cases/[id]/schedule: SET direto de status +
// histórico manual, em vez de transitionCase/ALLOWED_TRANSITIONS.
const ELIGIBLE_STATUSES: CaseStatus[] = ["AGENDADO", "AGUARDANDO_ROTA", "ROTA_PLANEJADA"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireUser();
    const { id: caseId } = await params;
    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Informe o nome do motoboy" }, { status: 400 });
    }
    const { courierName, note } = parsed.data;

    const caseRecord = await prisma.caseRecord.findUnique({ where: { id: caseId } });
    if (!caseRecord) return NextResponse.json({ error: "Caso não encontrado" }, { status: 404 });
    if (!ELIGIBLE_STATUSES.includes(caseRecord.status)) {
      return NextResponse.json(
        { error: `Não é possível marcar como enviado a partir do status atual (${caseRecord.status}).` },
        { status: 409 }
      );
    }

    const reason = `Marcado manualmente como enviado ao motoboy (${courierName})`;

    await prisma.caseRecord.update({ where: { id: caseId }, data: { status: "ATRIBUIDO_MOTOBOY" } });
    await prisma.caseStatusHistory.create({
      data: {
        caseId,
        fromStatus: caseRecord.status,
        toStatus: "ATRIBUIDO_MOTOBOY",
        origin: "ATENDENTE",
        reason,
        note,
        changedByUserId: session.sub,
      },
    });
    await prisma.caseNote.create({
      data: {
        caseId,
        userId: session.sub,
        body: `Enviado ao motoboy (marcação manual): ${courierName}${note ? ` — ${note}` : ""}`,
      },
    });

    await writeAudit({
      userId: session.sub,
      action: "case_mark_dispatched",
      entity: "case_records",
      entityId: caseId,
      afterData: { courierName, note },
      origin: "atendente",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
