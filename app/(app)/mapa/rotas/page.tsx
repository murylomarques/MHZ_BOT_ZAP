import Link from "next/link";
import { prisma } from "@/lib/server/db/prisma";
import { RouteCreateForm } from "./RouteCreateForm";
import { RouteRecalculateButton } from "./RouteRecalculateButton";

export const dynamic = "force-dynamic";

export default async function RotasPage() {
  const [eligible, couriers, routes] = await Promise.all([
    prisma.caseRecord.findMany({
      where: {
        status: "AGUARDANDO_ROTA",
        serviceOrder: { is: { customer: { addresses: { some: { latitude: { not: null } } } } } },
      },
      include: {
        serviceOrder: {
          include: { customer: { include: { addresses: { where: { latitude: { not: null } }, take: 1 } } } },
        },
      },
      take: 300,
    }),
    prisma.courier.findMany({ where: { status: "ATIVO" }, orderBy: { name: "asc" } }),
    prisma.route.findMany({
      include: {
        courier: true,
        stops: {
          include: { caseRecord: { include: { serviceOrder: { include: { customer: true } } } } },
          orderBy: { stopOrder: "asc" },
        },
      },
      orderBy: { date: "desc" },
      take: 50,
    }),
  ]);

  const eligibleCases = eligible.map((c) => ({
    id: c.id,
    customerName: c.serviceOrder.customer.name,
    city: c.serviceOrder.customer.city,
    saId: c.serviceOrder.saId,
  }));

  const courierOptions = couriers.map((c) => ({ id: c.id, name: c.name, vehicleType: c.vehicleType }));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Rotas</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Criação e acompanhamento de rotas de retirada
          </p>
        </div>
        <Link href="/mapa" className="text-sm underline" style={{ color: "var(--brand)" }}>
          Voltar para o mapa
        </Link>
      </div>

      <RouteCreateForm eligibleCases={eligibleCases} couriers={courierOptions} />

      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Rotas existentes</h2>
        {routes.length === 0 && (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Nenhuma rota criada ainda.
          </p>
        )}
        {routes.map((route) => (
          <div key={route.id} className="rounded-xl border p-4 space-y-2" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-sm">
                <span className="font-medium">{route.date.toLocaleDateString("pt-BR", { timeZone: "UTC" })}</span>
                {" — "}
                <span>{route.courier?.name ?? "Sem motoboy"}</span>
                {" — "}
                <span style={{ color: "var(--text-muted)" }}>{route.status}</span>
              </div>
              <RouteRecalculateButton routeId={route.id} />
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b" style={{ borderColor: "var(--border)" }}>
                  <th className="p-2 w-10">#</th>
                  <th className="p-2">Cliente</th>
                  <th className="p-2">Cidade</th>
                  <th className="p-2">Distância acum. (km)</th>
                  <th className="p-2">Status parada</th>
                </tr>
              </thead>
              <tbody>
                {route.stops.map((stop) => (
                  <tr key={stop.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                    <td className="p-2">{stop.stopOrder}</td>
                    <td className="p-2">
                      <Link href={`/operacoes/${stop.caseId}`} className="underline" style={{ color: "var(--brand)" }}>
                        {stop.caseRecord.serviceOrder.customer.name}
                      </Link>
                    </td>
                    <td className="p-2">{stop.caseRecord.serviceOrder.customer.city}</td>
                    <td className="p-2">{stop.estimatedDistanceKm?.toFixed(1) ?? "-"}</td>
                    <td className="p-2">{stop.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
