import { prisma } from "@/lib/server/db/prisma";
import type { ClosureStatus } from "@prisma/client";
import Link from "next/link";
import { ClosuresTable } from "./ClosuresTable";

export const dynamic = "force-dynamic";

const TABS: { value: ClosureStatus; label: string }[] = [
  { value: "AGUARDANDO", label: "Aguardando" },
  { value: "PROCESSANDO", label: "Processando" },
  { value: "REALIZADA", label: "Realizada" },
  { value: "ERRO", label: "Erro" },
  { value: "DIVERGENCIA", label: "Divergência" },
];

// Limiar de atraso do alerta de "aguardando baixa há muito tempo" — seção 16
// do spec pede um alerta configurável; como não existe tela de configuração
// para isso ainda, fica como constante aqui (fácil de promover para
// SystemSetting no futuro).
const OVERDUE_HOURS = 48;

export default async function BaixasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const activeTab = TABS.some((t) => t.value === sp.status) ? (sp.status as ClosureStatus) : "AGUARDANDO";

  const overdueThreshold = new Date(Date.now() - OVERDUE_HOURS * 60 * 60 * 1000);

  const [counts, closures, overdueCount] = await Promise.all([
    prisma.systemClosure.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.systemClosure.findMany({
      where: { status: activeTab },
      include: {
        pickup: {
          include: {
            caseRecord: { include: { serviceOrder: { include: { customer: true } } } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.systemClosure.count({
      where: { status: "AGUARDANDO", createdAt: { lt: overdueThreshold } },
    }),
  ]);

  const countByStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Record<
    ClosureStatus,
    number
  >;

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Baixas</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Baixa no sistema externo dos casos com equipamento retirado
        </p>
      </div>

      {overdueCount > 0 && (
        <div
          className="rounded-xl border p-3 text-sm"
          style={{ borderColor: "var(--warning)", background: "color-mix(in srgb, var(--warning) 12%, transparent)", color: "var(--warning)" }}
        >
          {overdueCount} baixa(s) aguardando há mais de {OVERDUE_HOURS}h sem processamento.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <Link
            key={tab.value}
            href={`/baixas?status=${tab.value}`}
            className="rounded-lg px-3 py-2 text-sm font-medium"
            style={
              tab.value === activeTab
                ? { background: "var(--brand)", color: "var(--brand-fg)" }
                : { border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }
            }
          >
            {tab.label} ({countByStatus[tab.value] ?? 0})
          </Link>
        ))}
      </div>

      <ClosuresTable
        closures={closures.map((c) => ({
          id: c.id,
          status: c.status,
          closureCode: c.closureCode,
          attempts: c.attempts,
          lastError: c.lastError,
          createdAt: c.createdAt.toISOString(),
          customerName: c.pickup.caseRecord.serviceOrder.customer.name,
          city: c.pickup.caseRecord.serviceOrder.customer.city,
          saId: c.pickup.caseRecord.serviceOrder.saId,
        }))}
        showBulkAction={activeTab === "AGUARDANDO" || activeTab === "ERRO"}
      />
    </div>
  );
}
