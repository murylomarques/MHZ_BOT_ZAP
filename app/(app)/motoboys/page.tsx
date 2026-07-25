import { requireUser, roleHasPermission } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";
import { KNOWN_CITIES } from "@/lib/server/bot/cities";
import { getCourierFulfillmentToday, getCityCoverage, getStrandedStops } from "@/lib/server/status/motoboy-dashboard";
import { CouriersManager } from "./CouriersManager";

export const dynamic = "force-dynamic";

export default async function MotoboysPage() {
  const session = await requireUser();
  if (!roleHasPermission(session.role, "couriers_manage")) {
    return (
      <div className="p-6" style={{ color: "var(--text-muted)" }}>
        Acesso negado. Esta página é restrita a ADMIN e GESTOR.
      </div>
    );
  }

  const couriers = await prisma.courier.findMany({
    include: { coverage: true },
    orderBy: { name: "asc" },
  });

  // Indicadores simples a partir de Pickup/PickupEquipment — ver observações no
  // relatório da tarefa sobre o que foi deixado de fora (KM real, tempo médio).
  const pickupByCourierResult = await prisma.pickup.groupBy({
    by: ["courierId", "result"],
    where: { courierId: { not: null } },
    _count: { _all: true },
  });

  const equipmentByCourier = await prisma.$queryRaw<{ courier_id: string; total: bigint }[]>`
    select p.courier_id, count(*) as total
    from pickup_equipment pe
    join pickups p on p.id = pe.pickup_id
    where p.courier_id is not null
    group by p.courier_id
  `;

  const equipmentMap = new Map<string, number>(equipmentByCourier.map((r) => [r.courier_id, Number(r.total)]));

  const [fulfillment, coverage, stranded] = await Promise.all([
    getCourierFulfillmentToday(),
    getCityCoverage(),
    getStrandedStops(),
  ]);

  function statsFor(courierId: string) {
    let realizadas = 0;
    let naoRealizadas = 0;
    for (const row of pickupByCourierResult) {
      if (row.courierId !== courierId) continue;
      if (row.result === "retirado") realizadas += row._count._all;
      else naoRealizadas += row._count._all;
    }
    const totalComResultado = realizadas + naoRealizadas;
    const taxaSucesso = totalComResultado > 0 ? `${((realizadas / totalComResultado) * 100).toFixed(1)}%` : "-";
    return {
      retiradasRealizadas: realizadas,
      retiradasNaoRealizadas: naoRealizadas,
      taxaSucesso,
      equipamentosRetirados: equipmentMap.get(courierId) ?? 0,
    };
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Motoboys</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {couriers.length} motoboy(s) cadastrado(s). Indicadores de KM percorrido e tempo médio por
          retirada não estão disponíveis ainda — o modelo de dados não registra distância real percorrida
          nem timestamps de início/fim do deslocamento, apenas a distância estimada de rota planejada.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <div className="text-sm font-medium mb-1">Cumprindo a agenda hoje</div>
          <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
            Motoboys ativos sem rota hoje não aparecem aqui (não têm agenda pra cumprir).
          </p>
          <div className="space-y-2">
            {fulfillment
              .filter((f) => f.hasRouteToday)
              .map((f) => {
                const label =
                  f.resolvedStops === 0
                    ? "Sem movimentação"
                    : f.resolvedStops < f.totalStops
                    ? "Em andamento"
                    : "Concluiu";
                const color =
                  f.resolvedStops === 0 ? "var(--danger, #e05252)" : f.resolvedStops < f.totalStops ? "var(--warning, #b8860b)" : "var(--success, #2e8b57)";
                return (
                  <div key={f.courierId} className="flex items-center justify-between text-sm">
                    <span>{f.name}</span>
                    <span style={{ color }}>
                      {label} ({f.resolvedStops}/{f.totalStops})
                    </span>
                  </div>
                );
              })}
            {fulfillment.filter((f) => f.hasRouteToday).length === 0 && (
              <div className="text-sm" style={{ color: "var(--text-muted)" }}>
                Nenhum motoboy com rota hoje.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <div className="text-sm font-medium mb-1">Cobertura por cidade</div>
          <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
            Cidades com retirada pendente e se têm motoboy ativo cobrindo (em vermelho, as que não têm).
          </p>
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {coverage.map((row) => (
              <div key={row.city} className="flex items-center justify-between text-sm">
                <span style={{ color: row.hasActiveCourier ? undefined : "var(--danger, #e05252)" }}>{row.city}</span>
                <span style={{ color: "var(--text-muted)" }}>
                  {row.pendingCount} {row.hasActiveCourier ? "" : "— sem motoboy"}
                </span>
              </div>
            ))}
            {coverage.length === 0 && (
              <div className="text-sm" style={{ color: "var(--text-muted)" }}>
                Nenhuma retirada pendente no momento.
              </div>
            )}
          </div>
        </div>
      </div>

      {stranded.length > 0 && (
        <div
          className="rounded-xl border p-4"
          style={{ borderColor: "var(--danger, #e05252)", background: "var(--surface)" }}
        >
          <div className="text-sm font-medium mb-1" style={{ color: "var(--danger, #e05252)" }}>
            ⚠️ Paradas sem motoboy disponível
          </div>
          <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
            Motoboy ficou indisponível e não tinha outro pra repassar — precisa rebalancear manualmente.
          </p>
          <div className="space-y-1">
            {stranded.map((s) => (
              <div key={`${s.city}-${s.courierName}`} className="flex items-center justify-between text-sm">
                <span>
                  {s.city} — <span style={{ color: "var(--text-muted)" }}>era de {s.courierName}</span>
                </span>
                <span style={{ color: "var(--danger, #e05252)" }}>{s.count} parada(s)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <CouriersManager
        couriers={couriers.map((c) => ({
          ...c,
          coverage: c.coverage.map((cv) => ({ city: cv.city, district: cv.district })),
          stats: statsFor(c.id),
        }))}
        cities={KNOWN_CITIES}
      />
    </div>
  );
}
