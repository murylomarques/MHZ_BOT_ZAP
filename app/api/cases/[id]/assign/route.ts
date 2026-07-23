import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";
import { writeAudit } from "@/lib/server/auth/audit";

type AssignmentRow = {
  id: string;
  case_id: string;
  user_id: string;
  assigned_at: Date;
  released_at: Date | null;
  lock_version: number;
};

// Atribui o caso ao usuário atual de forma atômica: o INSERT ... ON CONFLICT
// só atualiza a linha se ela já for do próprio usuário ou estiver liberada
// (released_at not null). Se outro atendente estiver com o caso, a cláusula
// WHERE do DO UPDATE não bate, 0 linhas retornam, e devolvemos 409 — sem
// race condition entre o SELECT e o UPDATE.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireUser();
    const { id: caseId } = await params;

    const rows = await prisma.$queryRaw<AssignmentRow[]>`
      INSERT INTO case_assignments (id, case_id, user_id, assigned_at, released_at, lock_version)
      VALUES (gen_random_uuid(), ${caseId}::uuid, ${session.sub}::uuid, now(), null, 0)
      ON CONFLICT (case_id) DO UPDATE
        SET user_id = ${session.sub}::uuid, assigned_at = now(), released_at = null,
            lock_version = case_assignments.lock_version + 1
        WHERE case_assignments.user_id = ${session.sub}::uuid
           OR case_assignments.released_at IS NOT NULL
      RETURNING id, case_id, user_id, assigned_at, released_at, lock_version
    `;

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Este caso já está atribuído a outro atendente." },
        { status: 409 }
      );
    }

    const assignment = rows[0];

    await writeAudit({
      userId: session.sub,
      action: "case_assign",
      entity: "case_records",
      entityId: caseId,
      afterData: { userId: session.sub },
      origin: "atendente",
    });

    return NextResponse.json({ assignment });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
