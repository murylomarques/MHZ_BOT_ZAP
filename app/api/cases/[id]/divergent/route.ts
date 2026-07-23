import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";
import { writeAudit } from "@/lib/server/auth/audit";
import { findDivergenceReason } from "@/lib/server/status/divergence-reasons";

const bodySchema = z.object({
  reasonCode: z.string(),
  note: z.string().optional(),
});

// Encerra o caso como "Divergente" (visão simplificada do atendente) com um
// motivo — ver comentário em ../schedule/route.ts sobre por que isso faz um
// SET direto de status em vez de usar transitionCase/ALLOWED_TRANSITIONS.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireUser();
    const { id: caseId } = await params;
    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }

    const reason = findDivergenceReason(parsed.data.reasonCode);
    if (!reason) return NextResponse.json({ error: "Motivo inválido" }, { status: 400 });

    const caseRecord = await prisma.caseRecord.findUnique({ where: { id: caseId } });
    if (!caseRecord) return NextResponse.json({ error: "Caso não encontrado" }, { status: 404 });

    await prisma.caseRecord.update({ where: { id: caseId }, data: { status: reason.targetStatus } });
    await prisma.caseStatusHistory.create({
      data: {
        caseId,
        fromStatus: caseRecord.status,
        toStatus: reason.targetStatus,
        origin: "ATENDENTE",
        reason: reason.label,
        note: parsed.data.note,
        changedByUserId: session.sub,
      },
    });

    if (parsed.data.note) {
      await prisma.caseNote.create({ data: { caseId, userId: session.sub, body: parsed.data.note } });
    }

    await prisma.conversation.updateMany({
      where: { caseId, closedAt: null },
      data: { closedAt: new Date() },
    });

    await writeAudit({
      userId: session.sub,
      action: "case_mark_divergent",
      entity: "case_records",
      entityId: caseId,
      afterData: { reasonCode: reason.code, targetStatus: reason.targetStatus },
      origin: "atendente",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
