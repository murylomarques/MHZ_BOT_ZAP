import { prisma } from "@/lib/server/db/prisma";
import { STATUS_LABELS } from "@/lib/server/status/labels";
import { getDispatchStage, DISPATCH_STAGE_LABELS } from "@/lib/server/status/dispatch-stage";
import type { CaseStatus } from "@prisma/client";
import Link from "next/link";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function OperacoesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const statusFilter = sp.status ? (sp.status.split(",") as CaseStatus[]) : undefined;
  const cityFilter = sp.city;
  const search = sp.q?.trim();
  const dateFrom = sp.dateFrom?.trim();
  const dateTo = sp.dateTo?.trim();
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const where = {
    ...(statusFilter ? { status: { in: statusFilter } } : {}),
    ...(dateFrom || dateTo
      ? {
          appointment: {
            is: {
              date: {
                ...(dateFrom ? { gte: new Date(`${dateFrom}T00:00:00.000Z`) } : {}),
                ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59.999Z`) } : {}),
              },
            },
          },
        }
      : {}),
    serviceOrder: {
      is: {
        ...(cityFilter ? { customer: { city: cityFilter } } : {}),
        ...(search
          ? {
              OR: [
                { saId: { contains: search, mode: "insensitive" as const } },
                { woNumber: { contains: search, mode: "insensitive" as const } },
                { customer: { name: { contains: search, mode: "insensitive" as const } } },
                { customer: { phone: { contains: search } } },
              ],
            }
          : {}),
      },
    },
  };

  const [total, cases] = await Promise.all([
    prisma.caseRecord.count({ where }),
    prisma.caseRecord.findMany({
      where,
      include: {
        serviceOrder: { include: { customer: true } },
        assignment: { include: { user: { select: { name: true } } } },
        appointment: true,
        botMessages: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      },
      orderBy: dateFrom || dateTo ? { appointment: { date: "asc" } } : { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const cities = await prisma.customer.findMany({
    select: { city: true },
    distinct: ["city"],
    orderBy: { city: "asc" },
  });

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Central de Operações</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {total.toLocaleString("pt-BR")} casos encontrados
          </p>
        </div>
      </div>

      <form className="flex flex-wrap gap-2" method="get">
        <input
          type="text"
          name="q"
          defaultValue={search}
          placeholder="Buscar por nome, telefone, SA, WO..."
          className="rounded-lg border px-3 py-2 text-sm flex-1 min-w-[240px]"
          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
        />
        <select
          name="city"
          defaultValue={cityFilter ?? ""}
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
        >
          <option value="">Todas as cidades</option>
          {cities.map((c) => (
            <option key={c.city} value={c.city}>
              {c.city}
            </option>
          ))}
        </select>
        <input
          type="date"
          name="dateFrom"
          defaultValue={dateFrom ?? ""}
          title="Agendado a partir de"
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
        />
        <input
          type="date"
          name="dateTo"
          defaultValue={dateTo ?? ""}
          title="Agendado até"
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
        />
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
              <th className="p-3">Status</th>
              <th className="p-3">Prioridade</th>
              <th className="p-3">Cliente</th>
              <th className="p-3">Telefone</th>
              <th className="p-3">Cidade</th>
              <th className="p-3">SA</th>
              <th className="p-3">WO</th>
              <th className="p-3">Data agendada</th>
              <th className="p-3">Etapa de disparo</th>
              <th className="p-3">Atendente</th>
              <th className="p-3">Atualizado em</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => (
              <tr key={c.id} className="border-b last:border-0 hover:opacity-90" style={{ borderColor: "var(--border)" }}>
                <td className="p-3">
                  <Link href={`/operacoes/${c.id}`} className="underline" style={{ color: "var(--brand)" }}>
                    {STATUS_LABELS[c.status]}
                  </Link>
                </td>
                <td className="p-3">{c.priority}</td>
                <td className="p-3">{c.serviceOrder.customer.name}</td>
                <td className="p-3">{c.serviceOrder.customer.phone}</td>
                <td className="p-3">{c.serviceOrder.customer.city}</td>
                <td className="p-3">{c.serviceOrder.saId}</td>
                <td className="p-3">{c.serviceOrder.woNumber ?? "-"}</td>
                <td className="p-3">
                  {c.appointment
                    ? `${c.appointment.date.toLocaleDateString("pt-BR", { timeZone: "UTC" })} (${c.appointment.windowStart}-${c.appointment.windowEnd})`
                    : "-"}
                </td>
                <td className="p-3">
                  {DISPATCH_STAGE_LABELS[getDispatchStage(c.status, c.botMessages[0]?.createdAt ?? null)]}
                </td>
                <td className="p-3">{c.assignment?.user.name ?? "-"}</td>
                <td className="p-3" style={{ color: "var(--text-muted)" }}>
                  {c.updatedAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                </td>
              </tr>
            ))}
            {cases.length === 0 && (
              <tr>
                <td colSpan={11} className="p-6 text-center" style={{ color: "var(--text-muted)" }}>
                  Nenhum caso encontrado com esses filtros.
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
            <Link href={buildQuery({ page: String(page - 1) })} className="underline">
              Anterior
            </Link>
          )}
          {page < totalPages && (
            <Link href={buildQuery({ page: String(page + 1) })} className="underline">
              Próxima
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
