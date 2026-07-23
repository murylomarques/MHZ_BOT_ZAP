import { requireUser, roleHasPermission } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";
import { KNOWN_CITIES } from "@/lib/server/bot/cities";
import { UsersManager } from "./UsersManager";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const session = await requireUser();
  if (!roleHasPermission(session.role, "users_manage")) {
    return (
      <div className="p-6" style={{ color: "var(--text-muted)" }}>
        Acesso negado. Esta página é restrita a ADMIN.
      </div>
    );
  }

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

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Usuários</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {users.length} usuário(s) cadastrado(s)
        </p>
      </div>

      <UsersManager
        users={users.map((u) => ({
          ...u,
          lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
          createdAt: u.createdAt.toISOString(),
        }))}
        cities={KNOWN_CITIES}
      />
    </div>
  );
}
