import { NextResponse } from "next/server";
import { getCurrentSession, type SessionPayload } from "./session";
import { prisma } from "../db/prisma";

export type Role = SessionPayload["role"];

// Matriz de permissões — checada no backend, não só escondida na UI (seção 21 do spec).
export const PERMISSIONS = {
  users_manage: ["ADMIN"],
  integrations_manage: ["ADMIN"],
  audit_view: ["ADMIN", "GESTOR"],
  import_run: ["ADMIN", "GESTOR"],
  campaigns_manage: ["ADMIN", "GESTOR"],
  cities_manage: ["ADMIN"],
  couriers_manage: ["ADMIN", "GESTOR"],
  cases_assign: ["ADMIN", "GESTOR"],
  cases_view_all_cities: ["ADMIN"],
  reports_export_all: ["ADMIN", "GESTOR"],
  settings_manage: ["ADMIN"],
  closures_manage: ["ADMIN", "GESTOR"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export class UnauthorizedError extends Error {}
export class ForbiddenError extends Error {}

export async function requireUser() {
  const session = await getCurrentSession();
  if (!session) throw new UnauthorizedError("Sessão inválida ou expirada");
  return session;
}

export async function requirePermission(permission: Permission) {
  const session = await requireUser();
  if (!roleHasPermission(session.role, permission)) {
    throw new ForbiddenError(`Permissão negada: ${permission}`);
  }
  return session;
}

// GESTOR e ATENDENTE são restritos às cidades liberadas em user_city_permissions.
// ADMIN enxerga todas as cidades.
export async function getAllowedCities(session: SessionPayload): Promise<string[] | "ALL"> {
  if (session.role === "ADMIN") return "ALL";
  const perms = await prisma.userCityPermission.findMany({
    where: { userId: session.sub },
    select: { city: true },
  });
  return perms.map((p) => p.city);
}

export function handleAuthError(err: unknown): NextResponse | null {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  return null;
}
