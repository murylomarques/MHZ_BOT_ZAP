import { requireUser, roleHasPermission } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";
import { KNOWN_CITIES } from "@/lib/server/bot/cities";
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
