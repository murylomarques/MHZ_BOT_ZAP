import Link from "next/link";
import { requireUser } from "@/lib/server/auth/rbac";
import { REPORTS } from "@/lib/server/reports/queries";

export const dynamic = "force-dynamic";

export default async function RelatoriosPage() {
  await requireUser();

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Relatórios</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Selecione um relatório para visualizar e exportar em CSV.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORTS.map((r) => (
          <Link
            key={r.key}
            href={`/relatorios/${r.key}`}
            className="rounded-xl border p-4 transition hover:shadow-sm"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <div className="text-sm font-medium">{r.title}</div>
            <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              {r.description}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
