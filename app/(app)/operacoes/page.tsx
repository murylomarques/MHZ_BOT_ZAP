import { prisma } from "@/lib/server/db/prisma";
import { STATUS_LABELS } from "@/lib/server/status/labels";
import { getDispatchStage, DISPATCH_STAGE_LABELS } from "@/lib/server/status/dispatch-stage";
import { buildGroupCopyText } from "@/lib/server/status/group-copy-text";
import { CopyGroupTextButton } from "./CopyGroupTextButton";
import { NotifiedToGroupToggle } from "./NotifiedToGroupToggle";
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
  const groupFilter = sp.grupo; // "enviado" | "pendente" — ver notified_to_group abaixo
  const prontosFilter = sp.prontos === "1"; // já tem dia/horário/endereço escolhidos, pronto pra copiar e enviar
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  // notified_to_group ainda não está no schema.prisma/client (SQL cru, ver
  // app/api/cases/[id]/notified-to-group/route.ts) — pra filtrar por ele,
  // primeiro descobre quais case_id batem com o filtro.
  let groupCaseIds: string[] | null = null;
  if (groupFilter === "enviado" || groupFilter === "pendente") {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM case_records WHERE notified_to_group = ${groupFilter === "enviado"}
    `;
    groupCaseIds = rows.map((r) => r.id);
  }

  // "Prontos para envio" = já tem appointment (dia+período escolhidos) e
  // endereço original do cliente — os mesmos dois requisitos de
  // `showGroupActions`/`buildGroupCopyText` abaixo.
  const needsAppointment = !!(dateFrom || dateTo || prontosFilter);

  const where = {
    ...(statusFilter ? { status: { in: statusFilter } } : {}),
    ...(needsAppointment
      ? {
          appointment: {
            is: {
              ...(dateFrom || dateTo
                ? {
                    date: {
                      ...(dateFrom ? { gte: new Date(`${dateFrom}T00:00:00.000Z`) } : {}),
                      ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59.999Z`) } : {}),
                    },
                  }
                : {}),
            },
          },
        }
      : {}),
    ...(groupCaseIds ? { id: { in: groupCaseIds } } : {}),
    serviceOrder: {
      is: {
        ...(cityFilter || prontosFilter
          ? {
              customer: {
                is: {
                  ...(cityFilter ? { city: cityFilter } : {}),
                  ...(prontosFilter ? { addresses: { some: {} } } : {}),
                },
              },
            }
          : {}),
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
        serviceOrder: { include: { customer: { include: { addresses: { take: 1 } } } } },
        assignment: { include: { user: { select: { name: true } } } },
        appointment: true,
        botMessages: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      },
      orderBy: dateFrom || dateTo ? { appointment: { date: "asc" } } : { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const caseIdsOnPage = cases.map((c) => c.id);
  const notifiedMap = new Map<string, boolean>();
  if (caseIdsOnPage.length > 0) {
    const notifiedRows = await prisma.$queryRaw<{ id: string; notified_to_group: boolean }[]>`
      SELECT id, notified_to_group FROM case_records WHERE id = ANY(${caseIdsOnPage}::uuid[])
    `;
    for (const row of notifiedRows) notifiedMap.set(row.id, row.notified_to_group);
  }

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
        <label className="flex items-center gap-1.5 text-sm" style={{ color: "var(--text-muted)" }}>
          Data agendada de
          <input
            type="date"
            name="dateFrom"
            defaultValue={dateFrom ?? ""}
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
          />
        </label>
        <label className="flex items-center gap-1.5 text-sm" style={{ color: "var(--text-muted)" }}>
          até
          <input
            type="date"
            name="dateTo"
            defaultValue={dateTo ?? ""}
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
          />
        </label>
        <select
          name="grupo"
          defaultValue={groupFilter ?? ""}
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
        >
          <option value="">Grupo: todos</option>
          <option value="pendente">Grupo: pendente</option>
          <option value="enviado">Grupo: enviado</option>
        </select>
        <label
          className="flex items-center gap-1.5 text-sm rounded-lg border px-3 py-2 cursor-pointer"
          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
        >
          <input type="checkbox" name="prontos" value="1" defaultChecked={prontosFilter} />
          Prontos para envio
        </label>
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
              <th className="p-3">SA</th>
              <th className="p-3">WO</th>
              <th className="p-3">Etapa de disparo</th>
              <th className="p-3">Atendente</th>
              <th className="p-3">Atualizado em</th>
              <th className="p-3">Grupo</th>
              <th className="p-3">Copiar</th>
              <th className="p-3">Cidade</th>
              <th className="p-3">Data agendada</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => {
              const originalAddress = c.serviceOrder.customer.addresses[0]?.fullAddress;
              // Flag/copiar só aparecem depois que o cliente já escolheu o
              // horário de retirada — ou seja, quando existe um Appointment
              // (windowStart é obrigatório nele) — pedido explícito do usuário.
              const showGroupActions = !!c.appointment && !!originalAddress;
              const groupCopyText = showGroupActions
                ? buildGroupCopyText({
                    city: c.serviceOrder.customer.city,
                    saId: c.serviceOrder.saId,
                    customerName: c.serviceOrder.customer.name,
                    phone: c.serviceOrder.customer.phone,
                    originalAddress: originalAddress!,
                    appointmentAddress: c.appointment?.address,
                    observation: c.appointment?.observation,
                    windowStart: c.appointment?.windowStart,
                    date: c.appointment?.date,
                  })
                : null;
              return (
                <tr key={c.id} className="border-b last:border-0 hover:opacity-90" style={{ borderColor: "var(--border)" }}>
                  <td className="p-3">
                    <Link href={`/operacoes/${c.id}`} className="underline" style={{ color: "var(--brand)" }}>
                      {STATUS_LABELS[c.status]}
                    </Link>
                  </td>
                  <td className="p-3">{c.priority}</td>
                  <td className="p-3">{c.serviceOrder.customer.name}</td>
                  <td className="p-3">{c.serviceOrder.customer.phone}</td>
                  <td className="p-3">{c.serviceOrder.saId}</td>
                  <td className="p-3">{c.serviceOrder.woNumber ?? "-"}</td>
                  <td className="p-3">
                    {DISPATCH_STAGE_LABELS[getDispatchStage(c.status, c.botMessages[0]?.createdAt ?? null)]}
                  </td>
                  <td className="p-3">{c.assignment?.user.name ?? "-"}</td>
                  <td className="p-3" style={{ color: "var(--text-muted)" }}>
                    {c.updatedAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                  </td>
                  <td className="p-3">
                    {showGroupActions ? (
                      <NotifiedToGroupToggle caseId={c.id} notified={notifiedMap.get(c.id) ?? false} />
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="p-3">{groupCopyText ? <CopyGroupTextButton text={groupCopyText} /> : "-"}</td>
                  <td className="p-3">{c.serviceOrder.customer.city}</td>
                  <td className="p-3">
                    {c.appointment
                      ? `${c.appointment.date.toLocaleDateString("pt-BR", { timeZone: "UTC" })} (${c.appointment.windowStart}-${c.appointment.windowEnd})`
                      : "-"}
                  </td>
                </tr>
              );
            })}
            {cases.length === 0 && (
              <tr>
                <td colSpan={13} className="p-6 text-center" style={{ color: "var(--text-muted)" }}>
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
