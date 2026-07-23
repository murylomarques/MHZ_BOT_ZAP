import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";
import { writeAudit } from "@/lib/server/auth/audit";
import { hashPassword } from "@/lib/server/auth/password";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["ADMIN", "GESTOR", "ATENDENTE"]).optional(),
  status: z.enum(["ATIVO", "BLOQUEADO"]).optional(),
  password: z.string().min(6).optional(),
  cities: z.array(z.string()).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("users_manage");
    const { id } = await params;

    const json = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }
    const { name, role, status, password, cities } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    const passwordHash = password ? await hashPassword(password) : undefined;
    const nextRole = role ?? existing.role;

    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(role !== undefined ? { role } : {}),
          ...(status !== undefined ? { status } : {}),
          ...(passwordHash !== undefined ? { passwordHash } : {}),
        },
      });

      if (cities !== undefined) {
        await tx.userCityPermission.deleteMany({ where: { userId: id } });
        if (cities.length > 0 && nextRole !== "ADMIN") {
          await tx.userCityPermission.createMany({
            data: cities.map((city) => ({ userId: id, city })),
          });
        }
      }

      return user;
    });

    await writeAudit({
      userId: session.sub,
      action: "user_update",
      entity: "app_users",
      entityId: id,
      beforeData: { name: existing.name, role: existing.role, status: existing.status },
      afterData: { name: updated.name, role: updated.role, status: updated.status },
      origin: session.role.toLowerCase(),
    });

    const { passwordHash: _omit, ...safeUser } = updated;
    void _omit;
    return NextResponse.json({ user: safeUser });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
