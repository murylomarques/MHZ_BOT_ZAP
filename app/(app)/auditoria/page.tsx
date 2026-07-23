import { requireUser, roleHasPermission } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireUser();
  if (!roleHasPermission(session.role, "audit_view")) {
    return (
      <div className="p-6" style={{ color: "var(--text-muted)" }}>
        Acesso negado. Esta página é restrita a ADMIN e GESTOR.
      </div>
    );
  }

  const sp = await searchParams;
  const action = sp.action?.trim();
  const entity = sp.entity?.trim();
  const userQuery = sp.user?.trim();
  const from = sp.from;
  const to = sp.to;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const where: Prisma.AuditLogWhereInput = {
    ...(action ? { action: { contains: action, mode: "insensitive" } } : {}),
    ...(entity ? { entity: { contains: entity, mode: "insensitive" } } : {}),
    ...(userQuery
      ? {
          user: {
            is: {
              OR: [
                { name: { contains: userQuery, mode: "insensitive" } },
                { email: { contains: userQuery, mode: "insensitive" } },
              ],
            },
          },
        }
      : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: new Date(`${from}T00:00:00`) } : {}),
            ...(to ? { lte: new Date(`${to}T23:59:59.999`) } : {}),
          },
        }
      : {}),
  };

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildQuery(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const merged = { ...sp, ...overrides };
    Object.entries(merged).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    return `?${params.toString()}`;
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Auditoria</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {total.toLocaleString("pt-BR")} eventos registrados
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-2" method="get">
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
            Ação
          </label>
          <input
            type="text"
            name="action"
            defaultValue={action}
            placeholder="ex: login_failed"
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
          />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
            Entidade
          </label>
          <input
            type="text"
            name="entity"
            defaultValue={entity}
            placeholder="ex: app_users"
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
          />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
            Usuário
          </label>
          <input
            type="text"
            name="user"
            defaultValue={userQuery}
            placeholder="nome ou e-mail"
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
          />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
            De
          </label>
          <input
            type="date"
            name="from"
            defaultValue={from ?? ""}
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
          />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
            Até
          </label>
          <input
            type="date"
            name="to"
            defaultValue={to ?? ""}
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
          />
        </div>
        <button
          type="submit"
          className="rounded-lg px-3 py-2 text-sm font-medium"
          style={{ background: "var(--brand)", color: "var(--brand-fg)" }}
        >
          Filtrar
        </button>
      </form>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="text-left border-b" style={{ borderColor: "var(--border)" }}>
              <th className="p-3">Data</th>
              <th className="p-3">Usuário</th>
              <th className="p-3">Ação</th>
              <th className="p-3">Entidade</th>
              <th className="p-3">Registro</th>
              <th className="p-3">Origem</th>
              <th className="p-3">IP</th>
              <th className="p-3">Antes / Depois</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b last:border-0 align-top" style={{ borderColor: "var(--border)" }}>
                <td className="p-3" style={{ color: "var(--text-muted)" }}>
                  {log.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                </td>
                <td className="p-3">{log.user ? `${log.user.name} (${log.user.email})` : "-"}</td>
                <td className="p-3">{log.action}</td>
                <td className="p-3">{log.entity}</td>
                <td className="p-3">{log.entityId ?? "-"}</td>
                <td className="p-3">{log.origin ?? "-"}</td>
                <td className="p-3">{log.ip ?? "-"}</td>
                <td className="p-3 whitespace-normal">
                  {(log.beforeData !== null && log.beforeData !== undefined) ||
                  (log.afterData !== null && log.afterData !== undefined) ? (
                    <details>
                      <summary className="cursor-pointer underline text-xs" style={{ color: "var(--brand)" }}>
                        Ver dados
                      </summary>
                      <div className="mt-1 space-y-1">
                        {log.beforeData !== null && log.beforeData !== undefined && (
                          <div>
                            <div className="text-xs font-medium">Antes</div>
                            <pre className="text-xs overflow-x-auto rounded p-2" style={{ background: "var(--bg)" }}>
                              {JSON.stringify(log.beforeData, null, 2)}
                            </pre>
                          </div>
                        )}
                        {log.afterData !== null && log.afterData !== undefined && (
                          <div>
                            <div className="text-xs font-medium">Depois</div>
                            <pre className="text-xs overflow-x-auto rounded p-2" style={{ background: "var(--bg)" }}>
                              {JSON.stringify(log.afterData, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </details>
                  ) : (
                    "-"
                  )}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center" style={{ color: "var(--text-muted)" }}>
                  Nenhum evento encontrado com esses filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span style={{ color: "var(--text-muted)" }}>
          Página {page} de {totalPages}
        </span>
        <div className="flex gap-2">
          {page > 1 && (
            <a href={buildQuery({ page: String(page - 1) })} className="underline">
              Anterior
            </a>
          )}
          {page < totalPages && (
            <a href={buildQuery({ page: String(page + 1) })} className="underline">
              Próxima
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
