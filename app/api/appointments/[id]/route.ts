import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";
import { writeAudit } from "@/lib/server/auth/audit";
import { transitionCase, InvalidTransitionError } from "@/lib/server/status/transitions";

const patchSchema = z.object({
  date: z.string().optional(),
  windowStart: z.string().min(1).optional(),
  windowEnd: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  observation: z.string().optional(),
});

// PATCH — reagendamento: atualiza data/janela/endereço e registra o estado
// anterior em AppointmentHistory (changeType "reagendado").
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireUser();
    const { id } = await params;
    const json = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }

    const existing = await prisma.appointment.findUnique({
      where: { id },
      include: { caseRecord: { include: { serviceOrder: { include: { customer: true } } } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Agendamento não encontrado" }, { status: 404 });
    }

    const data = parsed.data;
    const nextDate = data.date ? new Date(`${data.date}T00:00:00.000Z`) : existing.date;
    const nextWindowStart = data.windowStart ?? existing.windowStart;
    const nextWindowEnd = data.windowEnd ?? existing.windowEnd;
    const city = existing.caseRecord.serviceOrder.customer.city;

    // Revalida bloqueio de data e capacidade quando algo relevante mudou.
    const changedSlot =
      nextDate.getTime() !== existing.date.getTime() ||
      nextWindowStart !== existing.windowStart ||
      nextWindowEnd !== existing.windowEnd;

    if (changedSlot) {
      const blocked = await prisma.blockedDate.findFirst({
        where: { date: nextDate, OR: [{ city }, { city: null }] },
      });
      if (blocked) {
        return NextResponse.json(
          { error: `Data bloqueada para agendamento${blocked.reason ? `: ${blocked.reason}` : ""}.` },
          { status: 409 }
        );
      }

      const weekday = nextDate.getUTCDay();
      const rule = await prisma.cityCapacityRule.findFirst({
        where: { city, weekday, windowStart: nextWindowStart, windowEnd: nextWindowEnd },
      });
      if (rule) {
        const [countDay, countWindow] = await Promise.all([
          prisma.appointment.count({
            where: {
              date: nextDate,
              caseRecord: { serviceOrder: { customer: { city } } },
              id: { not: id },
            },
          }),
          prisma.appointment.count({
            where: {
              date: nextDate,
              windowStart: nextWindowStart,
              windowEnd: nextWindowEnd,
              caseRecord: { serviceOrder: { customer: { city } } },
              id: { not: id },
            },
          }),
        ]);
        if (countDay >= rule.maxPerDay) {
          return NextResponse.json(
            { error: `Capacidade máxima do dia para ${city} atingida (${rule.maxPerDay}).` },
            { status: 409 }
          );
        }
        if (countWindow >= rule.maxPerWindow) {
          return NextResponse.json(
            {
              error: `Capacidade máxima da janela ${nextWindowStart}-${nextWindowEnd} para ${city} atingida (${rule.maxPerWindow}).`,
            },
            { status: 409 }
          );
        }
      }
    }

    const previousData = {
      date: existing.date,
      windowStart: existing.windowStart,
      windowEnd: existing.windowEnd,
      address: existing.address,
      observation: existing.observation,
    };

    const updated = await prisma.$transaction(async (tx) => {
      const appt = await tx.appointment.update({
        where: { id },
        data: {
          date: nextDate,
          windowStart: nextWindowStart,
          windowEnd: nextWindowEnd,
          address: data.address ?? existing.address,
          observation: data.observation ?? existing.observation,
        },
      });
      await tx.appointmentHistory.create({
        data: {
          appointmentId: id,
          changedByUserId: session.sub,
          changeType: "reagendado",
          previousData,
        },
      });
      return appt;
    });

    await writeAudit({
      userId: session.sub,
      action: "appointment_reschedule",
      entity: "appointments",
      entityId: id,
      beforeData: previousData,
      afterData: updated,
      origin: "gestor",
    });

    return NextResponse.json({ appointment: updated });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}

// DELETE — cancelamento. Decisão de implementação: o registro Appointment é
// mantido (não é hard-deleted) porque AppointmentHistory referencia
// appointment_id com onDelete: Cascade — apagar o Appointment apagaria também
// seu próprio histórico, destruindo a trilha de auditoria. Em vez disso:
// grava AppointmentHistory (changeType "cancelado") preservando os dados
// anteriores, e transiciona o CaseRecord para CANCELADO. A tela de agenda
// deve considerar um Appointment "cancelado" filtrando pela última entrada de
// AppointmentHistory, ou pelo status CANCELADO do CaseRecord vinculado.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireUser();
    const { id } = await params;

    const existing = await prisma.appointment.findUnique({
      where: { id },
      include: { caseRecord: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Agendamento não encontrado" }, { status: 404 });
    }

    await prisma.appointmentHistory.create({
      data: {
        appointmentId: id,
        changedByUserId: session.sub,
        changeType: "cancelado",
        previousData: {
          date: existing.date,
          windowStart: existing.windowStart,
          windowEnd: existing.windowEnd,
          address: existing.address,
          observation: existing.observation,
        },
      },
    });

    try {
      await transitionCase({
        caseId: existing.caseId,
        to: "CANCELADO",
        origin: "GESTOR",
        reason: "Agendamento cancelado",
        changedByUserId: session.sub,
      });
    } catch (err) {
      if (err instanceof InvalidTransitionError) {
        return NextResponse.json(
          {
            error:
              "O histórico de cancelamento foi registrado, mas o caso não pôde ser movido para CANCELADO a partir do status atual.",
          },
          { status: 409 }
        );
      }
      throw err;
    }

    await writeAudit({
      userId: session.sub,
      action: "appointment_cancel",
      entity: "appointments",
      entityId: id,
      beforeData: existing,
      origin: "gestor",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
