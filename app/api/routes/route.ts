import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";
import { writeAudit } from "@/lib/server/auth/audit";
import { transitionCase, InvalidTransitionError } from "@/lib/server/status/transitions";
import { nearestNeighborOrder, twoOptImprove, cumulativeDistances, type GeoPoint } from "@/lib/server/routing/optimize";

const bodySchema = z.object({
  courierId: z.string().uuid(),
  date: z.string(), // YYYY-MM-DD
  caseIds: z.array(z.string().uuid()).min(1),
});

export async function GET() {
  try {
    await requirePermission("couriers_manage");
    const routes = await prisma.route.findMany({
      include: {
        courier: true,
        stops: {
          include: { caseRecord: { include: { serviceOrder: { include: { customer: true } } } } },
          orderBy: { stopOrder: "asc" },
        },
      },
      orderBy: { date: "desc" },
      take: 100,
    });
    return NextResponse.json({ routes });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission("couriers_manage");
    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }
    const { courierId, date, caseIds } = parsed.data;

    const courier = await prisma.courier.findUnique({ where: { id: courierId } });
    if (!courier) {
      return NextResponse.json({ error: "Motoboy não encontrado" }, { status: 404 });
    }

    const cases = await prisma.caseRecord.findMany({
      where: { id: { in: caseIds } },
      include: {
        serviceOrder: {
          include: {
            customer: {
              include: { addresses: { where: { latitude: { not: null } }, orderBy: { createdAt: "desc" }, take: 1 } },
            },
          },
        },
      },
    });

    // Só entram na rota os casos que realmente têm endereço geocodificado —
    // sem isso não há como calcular a ordem das paradas.
    const withCoords = cases.filter((c) => c.serviceOrder.customer.addresses[0]);
    const semEndereco = caseIds.filter((id) => !withCoords.some((c) => c.id === id));

    if (withCoords.length === 0) {
      return NextResponse.json(
        { error: "Nenhum dos casos selecionados tem endereço geocodificado." },
        { status: 400 }
      );
    }

    const points: GeoPoint[] = withCoords.map((c) => {
      const addr = c.serviceOrder.customer.addresses[0];
      return { lat: addr.latitude as number, lng: addr.longitude as number };
    });

    // Ponto de partida: por não haver conceito de base/depósito configurável
    // ainda no sistema, usamos o primeiro caso selecionado como origem — é a
    // opção mais simples e previsível para esta primeira versão.
    const initialOrder = nearestNeighborOrder(points);
    const optimizedOrder = twoOptImprove(initialOrder, points);
    const distances = cumulativeDistances(optimizedOrder, points);

    const dateOnly = new Date(`${date}T00:00:00.000Z`);

    const route = await prisma.route.create({
      data: {
        courierId,
        date: dateOnly,
        status: "PLANEJADA",
        startPoint: points[optimizedOrder[0]] as never,
      },
    });

    const casosIgnorados: { caseId: string; motivo: string }[] = [];

    for (const semEnd of semEndereco) {
      casosIgnorados.push({ caseId: semEnd, motivo: "Sem endereço geocodificado" });
    }

    for (let i = 0; i < optimizedOrder.length; i++) {
      const caseRecord = withCoords[optimizedOrder[i]];
      try {
        // A máquina de estados exige passar por AGUARDANDO_ROTA -> ROTA_PLANEJADA
        // -> ATRIBUIDO_MOTOBOY (três transições separadas). Cada caso é isolado
        // em try/catch: se o status atual não permitir, pulamos o caso em vez
        // de abortar a rota inteira.
        const current = await prisma.caseRecord.findUniqueOrThrow({ where: { id: caseRecord.id } });
        if (current.status === "AGENDADO") {
          await transitionCase({
            caseId: caseRecord.id,
            to: "AGUARDANDO_ROTA",
            origin: "GESTOR",
            reason: "Rota criada",
            changedByUserId: session.sub,
          });
        }
        await transitionCase({
          caseId: caseRecord.id,
          to: "ROTA_PLANEJADA",
          origin: "GESTOR",
          reason: "Rota criada",
          changedByUserId: session.sub,
        });
        await transitionCase({
          caseId: caseRecord.id,
          to: "ATRIBUIDO_MOTOBOY",
          origin: "GESTOR",
          reason: `Atribuído ao motoboy ${courier.name}`,
          changedByUserId: session.sub,
        });

        await prisma.routeStop.create({
          data: {
            routeId: route.id,
            caseId: caseRecord.id,
            stopOrder: i + 1,
            estimatedDistanceKm: distances[i],
          },
        });
      } catch (err) {
        casosIgnorados.push({
          caseId: caseRecord.id,
          motivo:
            err instanceof InvalidTransitionError
              ? err.message
              : err instanceof Error
              ? err.message
              : "Erro desconhecido",
        });
      }
    }

    await prisma.routeHistory.create({
      data: { routeId: route.id, event: "criada", data: { casosIgnorados } as never },
    });

    await writeAudit({
      userId: session.sub,
      action: "route_create",
      entity: "routes",
      entityId: route.id,
      afterData: { courierId, date, caseIds, casosIgnorados },
      origin: "gestor",
    });

    const created = await prisma.route.findUnique({
      where: { id: route.id },
      include: {
        courier: true,
        stops: { include: { caseRecord: { include: { serviceOrder: { include: { customer: true } } } } }, orderBy: { stopOrder: "asc" } },
      },
    });

    return NextResponse.json({ route: created, casosIgnorados }, { status: 201 });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
