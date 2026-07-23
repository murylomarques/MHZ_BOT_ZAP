import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";
import { writeAudit } from "@/lib/server/auth/audit";
import { nearestNeighborOrder, twoOptImprove, cumulativeDistances, type GeoPoint } from "@/lib/server/routing/optimize";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("couriers_manage");
    const { id } = await params;

    const route = await prisma.route.findUnique({
      where: { id },
      include: {
        stops: {
          include: {
            caseRecord: {
              include: {
                serviceOrder: {
                  include: {
                    customer: {
                      include: { addresses: { where: { latitude: { not: null } }, orderBy: { createdAt: "desc" }, take: 1 } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!route) {
      return NextResponse.json({ error: "Rota não encontrada" }, { status: 404 });
    }

    const stopsWithCoords = route.stops.filter((s) => s.caseRecord.serviceOrder.customer.addresses[0]);
    if (stopsWithCoords.length === 0) {
      return NextResponse.json({ error: "Nenhuma parada com endereço geocodificado nesta rota." }, { status: 400 });
    }

    const points: GeoPoint[] = stopsWithCoords.map((s) => {
      const addr = s.caseRecord.serviceOrder.customer.addresses[0];
      return { lat: addr.latitude as number, lng: addr.longitude as number };
    });

    const initialOrder = nearestNeighborOrder(points);
    const optimizedOrder = twoOptImprove(initialOrder, points);
    const distances = cumulativeDistances(optimizedOrder, points);

    await prisma.$transaction(
      optimizedOrder.map((pointIdx, i) =>
        prisma.routeStop.update({
          where: { id: stopsWithCoords[pointIdx].id },
          data: { stopOrder: i + 1, estimatedDistanceKm: distances[i] },
        })
      )
    );

    await prisma.route.update({ where: { id }, data: { startPoint: points[optimizedOrder[0]] as never } });

    await prisma.routeHistory.create({
      data: { routeId: id, event: "recalculada", data: { stopsCount: stopsWithCoords.length } as never },
    });

    await writeAudit({
      userId: session.sub,
      action: "route_recalculate",
      entity: "routes",
      entityId: id,
      afterData: { stopsCount: stopsWithCoords.length },
      origin: "gestor",
    });

    const updated = await prisma.route.findUnique({
      where: { id },
      include: {
        courier: true,
        stops: { include: { caseRecord: { include: { serviceOrder: { include: { customer: true } } } } }, orderBy: { stopOrder: "asc" } },
      },
    });

    return NextResponse.json({ route: updated });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
