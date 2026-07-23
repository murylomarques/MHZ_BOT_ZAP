import Link from "next/link";
import { prisma } from "@/lib/server/db/prisma";
import { STATUS_LABELS } from "@/lib/server/status/labels";
import type { CityCapacityRule, Prisma } from "@prisma/client";

type AppointmentWithCase = Prisma.AppointmentGetPayload<{
  include: { caseRecord: { include: { serviceOrder: { include: { customer: true } } } } };
}>;

export const dynamic = "force-dynamic";

type View = "day" | "week" | "month";

const WEEKDAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// Data "de hoje" no fuso de São Paulo, no formato YYYY-MM-DD (usado como
// default quando a query string não informa ?date=).
function todaySaoPaulo(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toDateOnlyString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

// Semana de negócio: segunda a domingo.
function startOfWeek(d: Date): Date {
  const dow = d.getUTCDay(); // 0=domingo
  const diff = (dow + 6) % 7; // dias desde a última segunda
  return addDays(d, -diff);
}

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function endOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

function formatBR(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// Cap por dia efetivo para uma cidade/data: entre as regras cadastradas para
// aquele dia da semana pode haver mais de uma janela com o mesmo max_per_day
// (o modelo permite, em tese, valores divergentes por janela); usamos o maior
// valor encontrado como teto do dia — simplificação documentada no relatório.
function effectiveMaxPerDay(rules: CityCapacityRule[], city: string, weekday: number): number | null {
  const matches = rules.filter((r) => r.city === city && r.weekday === weekday);
  if (matches.length === 0) return null;
  return Math.max(...matches.map((r) => r.maxPerDay));
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const view: View = sp.view === "week" || sp.view === "month" ? sp.view : "day";
  const dateParam = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todaySaoPaulo();
  const cityFilter = sp.city;
  const anchor = parseDateOnly(dateParam);

  let rangeStart: Date;
  let rangeEnd: Date;
  if (view === "day") {
    rangeStart = anchor;
    rangeEnd = anchor;
  } else if (view === "week") {
    rangeStart = startOfWeek(anchor);
    rangeEnd = addDays(rangeStart, 6);
  } else {
    rangeStart = startOfMonth(anchor);
    rangeEnd = endOfMonth(anchor);
  }

  const [appointments, rules, cities] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        date: { gte: rangeStart, lte: rangeEnd },
        ...(cityFilter
          ? { caseRecord: { serviceOrder: { customer: { city: cityFilter } } } }
          : {}),
      },
      include: {
        caseRecord: { include: { serviceOrder: { include: { customer: true } } } },
      },
      orderBy: [{ date: "asc" }, { windowStart: "asc" }],
    }),
    prisma.cityCapacityRule.findMany(),
    prisma.customer.findMany({ select: { city: true }, distinct: ["city"], orderBy: { city: "asc" } }),
  ]);

  function buildQuery(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const merged = { view, date: dateParam, city: cityFilter, ...overrides };
    Object.entries(merged).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    return `?${params.toString()}`;
  }

  // Agrupa por data (YYYY-MM-DD) para as views de semana/mês.
  const byDate = new Map<string, typeof appointments>();
  for (const appt of appointments) {
    const key = toDateOnlyString(appt.date);
    const arr = byDate.get(key) ?? [];
    arr.push(appt);
    byDate.set(key, arr);
  }

  // Capacidade por cidade/data presente no range carregado.
  function capacityBadges(dateKey: string) {
    const dayAppts = byDate.get(dateKey) ?? [];
    const byCity = new Map<string, number>();
    for (const a of dayAppts) {
      const city = a.caseRecord.serviceOrder.customer.city;
      byCity.set(city, (byCity.get(city) ?? 0) + 1);
    }
    const weekday = parseDateOnly(dateKey).getUTCDay();
    return Array.from(byCity.entries()).map(([city, used]) => {
      const max = effectiveMaxPerDay(rules, city, weekday);
      return { city, used, max };
    });
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-semibold">Agenda</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {view === "day" && formatBR(anchor)}
            {view === "week" && `${formatBR(rangeStart)} — ${formatBR(rangeEnd)}`}
            {view === "month" &&
              anchor.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" })}
          </p>
        </div>

        <form className="flex flex-wrap gap-2 items-center" method="get">
          <input type="hidden" name="view" value={view} />
          <input
            type="date"
            name="date"
            defaultValue={dateParam}
            className="rounded-lg border px-3 py-2 text-sm"
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
          <button
            type="submit"
            className="rounded-lg px-3 py-2 text-sm font-medium"
            style={{ background: "var(--brand)", color: "var(--brand-fg)" }}
          >
            Filtrar
          </button>
        </form>
      </div>

      <div className="flex gap-2 text-sm">
        {(["day", "week", "month"] as View[]).map((v) => (
          <Link
            key={v}
            href={buildQuery({ view: v })}
            className="rounded-lg px-3 py-1.5 border"
            style={{
              borderColor: "var(--border)",
              background: v === view ? "var(--brand)" : "var(--surface)",
              color: v === view ? "var(--brand-fg)" : "var(--text)",
            }}
          >
            {v === "day" ? "Dia" : v === "week" ? "Semana" : "Mês"}
          </Link>
        ))}
        <span className="flex-1" />
        <Link href={buildQuery({ date: toDateOnlyString(addDays(anchor, view === "month" ? -30 : view === "week" ? -7 : -1)) })} className="underline px-2">
          ← Anterior
        </Link>
        <Link href={buildQuery({ date: todaySaoPaulo() })} className="underline px-2">
          Hoje
        </Link>
        <Link href={buildQuery({ date: toDateOnlyString(addDays(anchor, view === "month" ? 30 : view === "week" ? 7 : 1)) })} className="underline px-2">
          Próximo →
        </Link>
      </div>

      {view === "day" && (
        <DayView appointments={appointments} badges={capacityBadges(dateParam)} />
      )}

      {view === "week" && (
        <WeekView rangeStart={rangeStart} byDate={byDate} capacityBadges={capacityBadges} buildQuery={buildQuery} />
      )}

      {view === "month" && (
        <MonthView anchor={anchor} byDate={byDate} buildQuery={buildQuery} />
      )}
    </div>
  );
}

function CapacityBadge({ city, used, max }: { city: string; used: number; max: number | null }) {
  const over = max != null && used >= max;
  return (
    <span
      className="text-xs rounded-full px-2 py-0.5 border"
      style={{
        borderColor: over ? "var(--danger)" : "var(--border)",
        color: over ? "var(--danger)" : "var(--text-muted)",
      }}
      title={max != null ? `Capacidade diária de ${city}` : `Sem regra de capacidade cadastrada para ${city}`}
    >
      {city}: {used}
      {max != null ? `/${max}` : ""}
    </span>
  );
}

function DayView({
  appointments,
  badges,
}: {
  appointments: AppointmentWithCase[];
  badges: { city: string; used: number; max: number | null }[];
}) {
  const byWindow = new Map<string, AppointmentWithCase[]>();
  for (const a of appointments) {
    const key = `${a.windowStart}-${a.windowEnd}`;
    const arr = byWindow.get(key) ?? [];
    arr.push(a);
    byWindow.set(key, arr);
  }
  const windows = Array.from(byWindow.keys()).sort();

  return (
    <div className="space-y-4">
      {badges.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {badges.map((b) => (
            <CapacityBadge key={b.city} {...b} />
          ))}
        </div>
      )}

      {windows.length === 0 && (
        <div className="rounded-xl border p-6 text-center text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          Nenhum agendamento para esta data.
        </div>
      )}

      {windows.map((w) => (
        <div key={w} className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <div className="px-4 py-2 text-sm font-medium border-b" style={{ borderColor: "var(--border)" }}>
            {w}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b" style={{ borderColor: "var(--border)" }}>
                <th className="p-3">Cliente</th>
                <th className="p-3">Telefone</th>
                <th className="p-3">Cidade</th>
                <th className="p-3">Endereço</th>
                <th className="p-3">SA</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {(byWindow.get(w) ?? []).map((a) => (
                <tr key={a.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                  <td className="p-3">
                    <Link href={`/operacoes/${a.caseId}`} className="underline" style={{ color: "var(--brand)" }}>
                      {a.caseRecord.serviceOrder.customer.name}
                    </Link>
                  </td>
                  <td className="p-3">{a.caseRecord.serviceOrder.customer.phone}</td>
                  <td className="p-3">{a.caseRecord.serviceOrder.customer.city}</td>
                  <td className="p-3">{a.address}</td>
                  <td className="p-3">{a.caseRecord.serviceOrder.saId}</td>
                  <td className="p-3">{STATUS_LABELS[a.caseRecord.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function WeekView({
  rangeStart,
  byDate,
  capacityBadges,
  buildQuery,
}: {
  rangeStart: Date;
  byDate: Map<string, AppointmentWithCase[]>;
  capacityBadges: (dateKey: string) => { city: string; used: number; max: number | null }[];
  buildQuery: (o: Record<string, string | undefined>) => string;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(rangeStart, i));

  return (
    <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
      {days.map((d) => {
        const key = toDateOnlyString(d);
        const appts = byDate.get(key) ?? [];
        const badges = capacityBadges(key);
        return (
          <div key={key} className="rounded-xl border p-2 space-y-2" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <Link href={buildQuery({ view: "day", date: key })} className="block">
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                {WEEKDAY_SHORT[d.getUTCDay()]}
              </div>
              <div className="text-sm font-medium underline" style={{ color: "var(--brand)" }}>
                {formatBR(d)}
              </div>
            </Link>
            <div className="flex flex-wrap gap-1">
              {badges.map((b) => (
                <CapacityBadge key={b.city} {...b} />
              ))}
            </div>
            <div className="space-y-1">
              {appts.slice(0, 6).map((a) => (
                <div key={a.id} className="text-xs truncate" title={a.caseRecord.serviceOrder.customer.name}>
                  <span style={{ color: "var(--text-muted)" }}>{a.windowStart}</span>{" "}
                  {a.caseRecord.serviceOrder.customer.name}
                </div>
              ))}
              {appts.length > 6 && (
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  +{appts.length - 6} agendamento(s)
                </div>
              )}
              {appts.length === 0 && (
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  —
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthView({
  anchor,
  byDate,
  buildQuery,
}: {
  anchor: Date;
  byDate: Map<string, AppointmentWithCase[]>;
  buildQuery: (o: Record<string, string | undefined>) => string;
}) {
  const first = startOfMonth(anchor);
  const last = endOfMonth(anchor);
  const leading = (first.getUTCDay() + 6) % 7; // segunda como primeiro dia da grade
  const totalDays = last.getUTCDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: totalDays }, (_, i) => new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), i + 1))),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="grid grid-cols-7 text-xs font-medium border-b" style={{ borderColor: "var(--border)" }}>
        {WEEKDAY_NAMES.slice(1).concat(WEEKDAY_NAMES[0]).map((name) => (
          <div key={name} className="p-2 text-center">
            {name}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          if (!d) {
            return <div key={`blank-${i}`} className="border-b border-r p-2 min-h-[80px]" style={{ borderColor: "var(--border)" }} />;
          }
          const key = toDateOnlyString(d);
          const count = (byDate.get(key) ?? []).length;
          return (
            <Link
              key={key}
              href={buildQuery({ view: "day", date: key })}
              className="border-b border-r p-2 min-h-[80px] flex flex-col gap-1 hover:opacity-80"
              style={{ borderColor: "var(--border)" }}
            >
              <span className="text-sm">{d.getUTCDate()}</span>
              {count > 0 && (
                <span
                  className="text-xs rounded-full px-2 py-0.5 self-start"
                  style={{ background: "var(--brand)", color: "var(--brand-fg)" }}
                >
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
