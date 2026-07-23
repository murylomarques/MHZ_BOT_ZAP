import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";
import { writeAudit } from "@/lib/server/auth/audit";

type ConversationRow = {
  id: string;
  case_id: string;
  owner_user_id: string | null;
  queue: string;
  last_message_at: Date | null;
  closed_at: Date | null;
  created_at: Date;
};

// Mesmo padrão de INSERT ... ON CONFLICT atômico usado em
// app/api/cases/[id]/assign/route.ts, aplicado à tabela conversations: a
// conversa é criada se ainda não existir, e o owner só é sobrescrito se
// estiver livre (owner_user_id null) ou já for do próprio usuário — dois
// atendentes não conseguem assumir a mesma conversa simultaneamente.
export async function POST(req: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
  try {
    const session = await requireUser();
    const { caseId } = await params;

    const caseRecord = await prisma.caseRecord.findUnique({ where: { id: caseId } });
    if (!caseRecord) {
      return NextResponse.json({ error: "Caso não encontrado" }, { status: 404 });
    }

    const rows = await prisma.$queryRaw<ConversationRow[]>`
      INSERT INTO conversations (id, case_id, owner_user_id, queue, last_message_at, closed_at, created_at)
      VALUES (gen_random_uuid(), ${caseId}::uuid, ${session.sub}::uuid, 'ATRIBUIDO', null, null, now())
      ON CONFLICT (case_id) DO UPDATE
        SET owner_user_id = ${session.sub}::uuid,
            queue = 'ATRIBUIDO'
        WHERE conversations.owner_user_id IS NULL
           OR conversations.owner_user_id = ${session.sub}::uuid
      RETURNING id, case_id, owner_user_id, queue, last_message_at, closed_at, created_at
    `;

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Esta conversa já está sendo atendida por outro atendente." },
        { status: 409 }
      );
    }

    const conversation = rows[0];

    await writeAudit({
      userId: session.sub,
      action: "conversation_assume",
      entity: "conversations",
      entityId: conversation.id,
      afterData: { caseId, ownerUserId: session.sub },
      origin: "atendente",
    });

    return NextResponse.json({ conversation });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
