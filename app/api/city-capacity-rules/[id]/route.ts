import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";
import { writeAudit } from "@/lib/server/auth/audit";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("cities_manage");
    const { id } = await params;

    const existing = await prisma.cityCapacityRule.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Regra não encontrada" }, { status: 404 });
    }

    await prisma.cityCapacityRule.delete({ where: { id } });

    await writeAudit({
      userId: session.sub,
      action: "city_capacity_rule_delete",
      entity: "city_capacity_rules",
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
