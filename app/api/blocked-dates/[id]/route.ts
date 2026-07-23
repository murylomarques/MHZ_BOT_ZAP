import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";
import { writeAudit } from "@/lib/server/auth/audit";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("cities_manage");
    const { id } = await params;

    const existing = await prisma.blockedDate.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Bloqueio não encontrado" }, { status: 404 });
    }

    await prisma.blockedDate.delete({ where: { id } });

    await writeAudit({
      userId: session.sub,
      action: "blocked_date_delete",
      entity: "blocked_dates",
      entityId: id,
      beforeData: existing,
      origin: "gestor",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
