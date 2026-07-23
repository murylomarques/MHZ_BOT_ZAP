import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";
import { writeAudit } from "@/lib/server/auth/audit";

const bodySchema = z.object({
  date: z.string(), // "YYYY-MM-DD"
  windowStart: z.string(),
  windowEnd: z.string(),
  address: z.string().min(3),
  city: z.string().min(1),
  observation: z.string().optional(),
});

// Ação principal do atendente na Central de Atendimento: agenda a retirada
// (com observação e endereço editável) e, se houver motoboy cobrindo a
// cidade informada, atribui automaticamente — sem passar pelo fluxo manual
// de montagem de rota do gestor. Isso é feito com um SET direto de status
// (não via transitionCase/ALLOWED_TRANSITIONS) porque esta ação de negócio é
// válida a partir de qualquer status "em atendimento humano", o que tornaria
// o grafo de transições formal impraticável de manter — o histórico ainda é
// gravado normalmente para auditoria/timeline.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireUser();
    const { id: caseId } = await params;
    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
    }
    const { date, windowStart, windowEnd, address, city, observation } = parsed.data;

    const caseRecord = await prisma.caseRecord.findUnique({
      where: { id: caseId },
      include: { serviceOrder: { include: { customer: true } } },
    });
    if (!caseRecord) return NextResponse.json({ error: "Caso não encontrado" }, { status: 404 });

    const fromStatus = caseRecord.status;
    const customerId = caseRecord.serviceOrder.customerId;

    await prisma.customerAddress.create({
      data: { customerId, kind: "confirmado", fullAddress: address },
    });
    if (city !== caseRecord.serviceOrder.customer.city) {
      await prisma.customer.update({ where: { id: customerId }, data: { city } });
    }

    await prisma.appointment.upsert({
      where: { caseId },
      create: {
        caseId,
        date: new Date(`${date}T00:00:00.000Z`),
        windowStart,
        windowEnd,
        address,
        observation,
        confirmedByClient: true,
      },
      update: {
        date: new Date(`${date}T00:00:00.000Z`),
        windowStart,
        windowEnd,
        address,
        observation,
      },
    });

    await prisma.caseRecord.update({ where: { id: caseId }, data: { status: "AGENDADO" } });
    await prisma.caseStatusHistory.create({
      data: {
        caseId,
        fromStatus,
        toStatus: "AGENDADO",
        origin: "ATENDENTE",
        reason: "Agendamento realizado pelo atendente",
        note: observation,
        changedByUserId: session.sub,
      },
    });

    // Tenta atribuir motoboy automaticamente pela cidade informada.
    const courier = await prisma.courier.findFirst({
      where: { status: "ATIVO", coverage: { some: { city } } },
    });

    let courierAssigned = false;
    if (courier) {
      const route = await prisma.route.create({
        data: { courierId: courier.id, date: new Date(`${date}T00:00:00.000Z`), status: "PLANEJADA" },
      });
      await prisma.routeStop.create({
        data: { routeId: route.id, caseId, stopOrder: 1, status: "PENDENTE" },
      });

      await prisma.caseRecord.update({ where: { id: caseId }, data: { status: "ATRIBUIDO_MOTOBOY" } });
      let hopFrom: typeof fromStatus | "AGENDADO" | "AGUARDANDO_ROTA" | "ROTA_PLANEJADA" = "AGENDADO";
      for (const toStatus of ["AGUARDANDO_ROTA", "ROTA_PLANEJADA", "ATRIBUIDO_MOTOBOY"] as const) {
        await prisma.caseStatusHistory.create({
          data: {
            caseId,
            fromStatus: hopFrom,
            toStatus,
            origin: "GESTOR",
            reason: `Atribuição automática ao motoboy ${courier.name} (cobre ${city})`,
            changedByUserId: session.sub,
          },
        });
        hopFrom = toStatus;
      }
      courierAssigned = true;
    }

    await writeAudit({
      userId: session.sub,
      action: "case_schedule",
      entity: "case_records",
      entityId: caseId,
      afterData: { date, windowStart, windowEnd, address, city, courierAssigned },
      origin: "atendente",
    });

    return NextResponse.json({
      ok: true,
      courierAssigned,
      message: courierAssigned
        ? "Agendado e motoboy atribuído automaticamente."
        : "Agendado. Nenhum motoboy cobre esta cidade ainda — atribua manualmente em Mapa e Rotas.",
    });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
