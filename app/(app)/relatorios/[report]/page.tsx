import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/server/auth/rbac";
import { getReportData, isReportKey, parseDateRange, REPORTS } from "@/lib/server/reports/queries";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ report: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireUser();

  const { report } = await params;
  if (!isReportKey(report)) notFound();

  const sp = await searchParams;
  const from = sp.from;
  const to = sp.to;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const range = parseDateRange(from, to);

  const meta = REPORTS.find((r) => r.key === report)!;
  const data = await getReportData(report, range, report === "base" ? { page, pageSize: PAGE_SIZE } : undefined);

  const totalPages = data.totalCount ? Math.max(1, Math.ceil(data.totalCount / PAGE_SIZE)) : 1;

  function buildQuery(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const merged = { ...sp, ...overrides };
    Object.entries(merged).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    return `?${params.toString()}`;
  }

  const exportParams = new URLSearchParams();
  if (from) exportParams.set("from", from);
  if (to) exportParams.set("to", to);
  exportParams.set("report", report);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <Link href="/relatorios" className="text-xs underline" style={{ color: "var(--text-muted)" }}>
            ← Relatórios
          </Link>
          <h1 className="text-lg font-semibold">{meta.title}</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {meta.description}
          </p>
        </div>
        <a
          href={`/api/reports/export?${exportParams.toString()}`}
          className="rounded-lg px-3 py-2 text-sm font-medium"
          style={{ background: "var(--brand)", color: "var(--brand-fg)" }}
        >
          Exportar CSV
        </a>
      </div>

      <form className="flex flex-wrap items-end gap-2" method="get">
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
              {data.headers.map((h) => (
                <th key={h} className="p-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, i) => (
              <tr key={i} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                {row.map((cell, j) => (
                  <td key={j} className="p-3">
                    {cell ?? "-"}
                  </td>
                ))}
              </tr>
            ))}
            {data.rows.length === 0 && (
              <tr>
                <td colSpan={data.headers.length} className="p-6 text-center" style={{ color: "var(--text-muted)" }}>
                  Nenhum dado encontrado para esse período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {report === "base" && data.totalCount !== undefined && (
        <div className="flex items-center justify-between text-sm">
          <span style={{ color: "var(--text-muted)" }}>
            {data.totalCount.toLocaleString("pt-BR")} casos — página {page} de {totalPages}
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
      )}
    </div>
  );
}
