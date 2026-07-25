import { prisma } from "@/lib/server/db/prisma";

export type CourierFulfillment = {
  courierId: string;
  name: string;
  hasRouteToday: boolean;
  totalStops: number;
  resolvedStops: number;
  routeStatus: string | null;
};

export type CityCoverage = {
  city: string;
  pendingCount: number;
  hasActiveCourier: boolean;
};

export type StrandedStop = {
  city: string;
  courierName: string;
  count: number;
};

// Cidades com demanda de retirada em andamento (agendado até atribuído a
// motoboy) — é o universo relevante pra saber se falta cobertura.
const DEMAND_STATUSES = ["AGENDADO", "AGUARDANDO_ROTA", "ROTA_PLANEJADA", "ATRIBUIDO_MOTOBOY"] as const;

export async function getCourierFulfillmentToday(): Promise<CourierFulfillment[]> {
  const couriers = await prisma.courier.findMany({
    where: { status: "ATIVO" },
    orderBy: { name: "asc" },
  });

  const rows = await prisma.$queryRaw<
    { courier_id: string; route_status: string; total: bigint; resolved: bigint }[]
  >`
    SELECT r.courier_id, r.status AS route_status,
           count(rs.id) AS total,
           count(rs.id) FILTER (WHERE rs.status IN ('CONCLUIDA', 'NAO_REALIZADA')) AS resolved
    FROM routes r
    JOIN route_stops rs ON rs.route_id = r.id
    WHERE r.date = CURRENT_DATE
    GROUP BY r.courier_id, r.status
  `;
  const byCourier = new Map(rows.map((r) => [r.courier_id, r]));

  return couriers.map((c) => {
    const row = byCourier.get(c.id);
    return {
      courierId: c.id,
      name: c.name,
      hasRouteToday: !!row,
      totalStops: row ? Number(row.total) : 0,
      resolvedStops: row ? Number(row.resolved) : 0,
      routeStatus: row?.route_status ?? null,
    };
  });
}

export async function getCityCoverage(): Promise<CityCoverage[]> {
  const demandRows = await prisma.$queryRaw<{ city: string; total: bigint }[]>`
    SELECT c.city, count(*) AS total
    FROM case_records cr
    JOIN service_orders so ON so.id = cr.service_order_id
    JOIN customers c ON c.id = so.customer_id
    WHERE cr.status::text = ANY(${DEMAND_STATUSES}::text[])
    GROUP BY c.city
  `;

  const coveredCities = await prisma.courierCoverage.findMany({
    where: { courier: { status: "ATIVO" } },
    select: { city: true },
    distinct: ["city"],
  });
  const coveredSet = new Set(coveredCities.map((c) => c.city));

  return demandRows
    .map((r) => ({ city: r.city, pendingCount: Number(r.total), hasActiveCourier: coveredSet.has(r.city) }))
    .sort((a, b) => {
      if (a.hasActiveCourier !== b.hasActiveCourier) return a.hasActiveCourier ? 1 : -1;
      return b.pendingCount - a.pendingCount;
    });
}

// Paradas ainda pendentes cuja rota pertence a um motoboy que não está mais
// ATIVO (ex: ficou off pelo WhatsApp e não teve pra quem repassar) — precisa
// de alguém do time olhar e rebalancear manualmente.
export async function getStrandedStops(): Promise<StrandedStop[]> {
  const rows = await prisma.$queryRaw<{ city: string; courier_name: string; count: bigint }[]>`
    SELECT c.city, co.name AS courier_name, count(*) AS count
    FROM route_stops rs
    JOIN routes r ON r.id = rs.route_id
    JOIN couriers co ON co.id = r.courier_id
    JOIN case_records cr ON cr.id = rs.case_id
    JOIN service_orders so ON so.id = cr.service_order_id
    JOIN customers c ON c.id = so.customer_id
    WHERE co.status != 'ATIVO' AND rs.status NOT IN ('CONCLUIDA', 'NAO_REALIZADA') AND r.date >= CURRENT_DATE
    GROUP BY c.city, co.name
    ORDER BY count DESC
  `;
  return rows.map((r) => ({ city: r.city, courierName: r.courier_name, count: Number(r.count) }));
}
