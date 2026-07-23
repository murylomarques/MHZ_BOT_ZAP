import { prisma } from "@/lib/server/db/prisma";
import { STATUS_LABELS } from "@/lib/server/status/labels";
import type { CaseStatus } from "@prisma/client";
import Link from "next/link";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

// Status que compõem a etapa de execução da retirada (seção 15 do spec).
const PICKUP_STATUSES: CaseStatus[] = [
  "ATRIBUIDO_MOTOBOY",
  "EM_DESLOCAMENTO",
  "EQUIPAMENTO_RETIRADO",
  "RETIRADA_NAO_REALIZADA",
  "CLIENTE_AUSENTE",
  "ENDERECO_NAO_LOCALIZADO",
];

export default async function RetiradasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const statusFilter = sp.status && PICKUP_STATUSES.includes(sp.status as CaseStatus) ? (sp.status as CaseStatus) : undefined;
  const cityFilter = sp.city;
  const courierFilter = sp.courier;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const where = {
    status: { in: statusFilter ? [statusFilter] : PICKUP_STATUSES },
    ...(cityFilter ? { serviceOrder: { is: { customer: { city: cityFilter } } } } : {}),
    ...(courierFilter ? { pickup: { is: { courierId: courierFilter } } } : {}),
  };

  const [total, cases, cities, couriers] = await Promise.all([
    prisma.caseRecord.count({ where }),
    prisma.caseRecord.findMany({
      where,
      include: {
        serviceOrder: { include: { customer: { include: { addresses: true } } } },
        pickup: { include: { courier: { select: { id: true, name: true } } } },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.customer.findMany({ select: { city: true }, distinct: ["city"], orderBy: { city: "asc" } }),
    prisma.courier.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
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
        <h1 className="text-lg font-semibold">Retiradas</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {total.toLocaleString("pt-BR")} casos na etapa de execução de retirada
        </p>
      </div>

      <form className="flex flex-wrap gap-2" method="get">
        <select
          name="status"
          defaultValue={statusFilter ?? ""}
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
        >
          <option value="">Todos os status</option>
          {PICKUP_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
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
        <select
          name="courier"
          defaultValue={courierFilter ?? ""}
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
        >
          <option value="">Todos os motoboys</option>
          {couriers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
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
              <th className="p-3">Cliente</th>
              <th className="p-3">Cidade</th>
              <th className="p-3">Endereço</th>
              <th className="p-3">Motoboy</th>
              <th className="p-3">Atualizado em</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => {
              const address = c.serviceOrder.customer.addresses[0]?.fullAddress;
              return (
                <tr key={c.id} className="border-b last:border-0 hover:opacity-90" style={{ borderColor: "var(--border)" }}>
                  <td className="p-3">{STATUS_LABELS[c.status]}</td>
                  <td className="p-3">{c.serviceOrder.customer.name}</td>
                  <td className="p-3">{c.serviceOrder.customer.city}</td>
                  <td className="p-3 max-w-[280px] truncate" title={address}>
                    {address ?? <span style={{ color: "var(--text-muted)" }}>Endereço não disponível na base importada</span>}
                  </td>
                  <td className="p-3">{c.pickup?.courier?.name ?? "-"}</td>
                  <td className="p-3" style={{ color: "var(--text-muted)" }}>
                    {c.updatedAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                  </td>
                  <td className="p-3">
                    <Link href={`/retiradas/${c.id}`} className="underline" style={{ color: "var(--brand)" }}>
                      Registrar retirada
                    </Link>
                  </td>
                </tr>
              );
            })}
            {cases.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center" style={{ color: "var(--text-muted)" }}>
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
