import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";
import { writeAudit } from "@/lib/server/auth/audit";
import { hashPassword } from "@/lib/server/auth/password";

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["ADMIN", "GESTOR", "ATENDENTE"]),
  cities: z.array(z.string()).optional(),
});

export async function GET() {
  try {
    await requirePermission("users_manage");
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        cityPermissions: { select: { city: true } },
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ users });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission("users_manage");
    const json = await req.json().catch(() => null);
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }
    const { name, email, password, role, cities } = parsed.data;

    const passwordHash = await hashPassword(password);

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { name, email, passwordHash, role },
      });
      if (cities && cities.length > 0 && role !== "ADMIN") {
        await tx.userCityPermission.createMany({
          data: cities.map((city) => ({ userId: created.id, city })),
        });
      }
      return created;
    });

    await writeAudit({
      userId: session.sub,
      action: "user_create",
      entity: "app_users",
      entityId: user.id,
      afterData: { name: user.name, email: user.email, role: user.role, status: user.status },
      origin: session.role.toLowerCase(),
    });

    const { passwordHash: _omit, ...safeUser } = user;
    void _omit;
    return NextResponse.json({ user: safeUser }, { status: 201 });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "Já existe um usuário com esse e-mail." }, { status: 409 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
