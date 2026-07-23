import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";
import { writeAudit } from "@/lib/server/auth/audit";
import { transitionCase, InvalidTransitionError } from "@/lib/server/status/transitions";

// Encerra a conversa (closed_at) e, quando o status atual do caso permitir,
// também avança o CaseRecord para FINALIZADO. Nem todo status atual tem uma
// transição direta para FINALIZADO (ver ALLOWED_TRANSITIONS) — nesse caso a
// conversa é encerrada normalmente e a mudança de status é apenas ignorada.
export async function POST(req: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
  try {
    const session = await requireUser();
    const { caseId } = await params;

    const conversation = await prisma.conversation.findUnique({ where: { caseId } });
    if (!conversation) {
      return NextResponse.json({ error: "Conversa não encontrada para este caso." }, { status: 404 });
    }

    const updated = await prisma.conversation.update({
      where: { caseId },
      data: { closedAt: new Date() },
    });

    let statusChanged = false;
    try {
      await transitionCase({
        caseId,
        to: "FINALIZADO",
        origin: "ATENDENTE",
        reason: "Conversa encerrada pelo atendente",
        changedByUserId: session.sub,
      });
      statusChanged = true;
    } catch (err) {
      if (!(err instanceof InvalidTransitionError)) throw err;
      // status atual não permite ir direto para FINALIZADO — ok, só fecha a conversa.
    }

    await writeAudit({
      userId: session.sub,
      action: "conversation_close",
      entity: "conversations",
      entityId: updated.id,
      afterData: { caseId, statusChanged },
      origin: "atendente",
    });

    return NextResponse.json({ conversation: updated, statusChanged });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
