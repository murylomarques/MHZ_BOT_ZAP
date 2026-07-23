import Link from "next/link";
import { prisma } from "@/lib/server/db/prisma";
import { STATUS_LABELS } from "@/lib/server/status/labels";
import { statusToMapColor, statusToMapGroup, MAP_STATUS_GROUPS, type MapStatusGroup } from "@/lib/server/status/map-colors";
import { GeocodeRunButton } from "./GeocodeRunButton";
import { MapViewClient } from "./MapViewClient";
import type { MapCasePoint } from "./MapView";

export const dynamic = "force-dynamic";

export default async function MapaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const cityFilter = sp.city;
  const groupFilter = sp.group as MapStatusGroup | undefined;
  const dateFilter = sp.date; // filtra por data do agendamento (Appointment.date)

  const cases = await prisma.caseRecord.findMany({
    where: {
      serviceOrder: {
        is: {
          customer: {
            addresses: { some: { latitude: { not: null } } },
            ...(cityFilter ? { city: cityFilter } : {}),
          },
        },
      },
      ...(dateFilter ? { appointment: { is: { date: new Date(`${dateFilter}T00:00:00.000Z`) } } } : {}),
    },
    include: {
      serviceOrder: {
        include: {
          customer: {
            include: {
              addresses: {
                where: { latitude: { not: null } },
                orderBy: { createdAt: "desc" },
                take: 1,
              },
            },
          },
        },
      },
    },
    take: 2000,
  });

  const points: MapCasePoint[] = cases
    .filter((c) => c.serviceOrder.customer.addresses[0])
    .map((c) => {
      const addr = c.serviceOrder.customer.addresses[0];
      return {
        caseId: c.id,
        lat: addr.latitude as number,
        lng: addr.longitude as number,
        customerName: c.serviceOrder.customer.name,
        city: c.serviceOrder.customer.city,
        saId: c.serviceOrder.saId,
        statusLabel: STATUS_LABELS[c.status],
        group: statusToMapGroup(c.status),
        color: statusToMapColor(c.status),
      };
    })
    .filter((p) => !groupFilter || p.group === groupFilter);

  const cities = await prisma.customer.findMany({
    select: { city: true },
    distinct: ["city"],
    orderBy: { city: "asc" },
  });

  const addressesTotal = await prisma.customerAddress.count();
  const addressesGeocoded = await prisma.customerAddress.count({ where: { latitude: { not: null } } });

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
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-semibold">Mapa e Rotas</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {addressesGeocoded} de {addressesTotal} endereço(s) geocodificado(s)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/mapa/rotas"
            className="rounded-lg px-3 py-2 text-sm font-medium border"
            style={{ borderColor: "var(--border)", color: "var(--text)" }}
          >
            Gerenciar rotas
          </Link>
          <GeocodeRunButton />
        </div>
      </div>

      {addressesTotal === 0 && (
        <div
          className="rounded-lg border p-3 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-muted)" }}
        >
          Nenhum endereço cadastrado ainda. A base importada via CSV não traz rua/endereço
          (só cidade), então o mapa só ganha pontos à medida que clientes confirmam o
          endereço pelo fluxo do bot (status &quot;Endereço confirmado&quot;) ou um atendente
          cadastra manualmente. Isso é esperado, não é um bug do mapa.
        </div>
      )}

      <form className="flex flex-wrap gap-2" method="get">
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
          name="group"
          defaultValue={groupFilter ?? ""}
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
        >
          <option value="">Todos os status</option>
          {(Object.entries(MAP_STATUS_GROUPS) as [MapStatusGroup, (typeof MAP_STATUS_GROUPS)[MapStatusGroup]][]).map(
            ([key, g]) => (
              <option key={key} value={key}>
                {g.label}
              </option>
            )
          )}
        </select>
        <input
          type="date"
          name="date"
          defaultValue={dateFilter ?? ""}
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
        />
        <button
          type="submit"
          className="rounded-lg px-3 py-2 text-sm font-medium"
          style={{ background: "var(--brand)", color: "var(--brand-fg)" }}
        >
          Filtrar
        </button>
        {(cityFilter || groupFilter || dateFilter) && (
          <Link href={buildQuery({ city: undefined, group: undefined, date: undefined })} className="text-sm underline self-center">
            Limpar filtros
          </Link>
        )}
      </form>

      <MapViewClient points={points} />
    </div>
  );
}
