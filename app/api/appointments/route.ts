import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";
import { writeAudit } from "@/lib/server/auth/audit";
import { transitionCase, InvalidTransitionError } from "@/lib/server/status/transitions";

const bodySchema = z.object({
  caseId: z.string().uuid(),
  date: z.string(), // YYYY-MM-DD
  windowStart: z.string().min(1),
  windowEnd: z.string().min(1),
  address: z.string().min(1),
  observation: z.string().optional(),
});

// Domingo=0 ... Sábado=6, calculado em UTC pois a coluna é @db.Date (sem hora/fuso).
function weekdayOf(dateOnly: Date): number {
  return dateOnly.getUTCDay();
}

export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const city = searchParams.get("city");

    const appointments = await prisma.appointment.findMany({
      where: {
        ...(from && to ? { date: { gte: new Date(from), lte: new Date(to) } } : {}),
        ...(city
          ? { caseRecord: { serviceOrder: { customer: { city } } } }
          : {}),
      },
      include: {
        caseRecord: { include: { serviceOrder: { include: { customer: true } } } },
      },
      orderBy: [{ date: "asc" }, { windowStart: "asc" }],
    });

    return NextResponse.json({ appointments });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireUser();
    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }
    const { caseId, date, windowStart, windowEnd, address, observation } = parsed.data;

    const dateOnly = new Date(`${date}T00:00:00.000Z`);

    const caseRecord = await prisma.caseRecord.findUnique({
      where: { id: caseId },
      include: { serviceOrder: { include: { customer: true } }, appointment: true },
    });
    if (!caseRecord) {
      return NextResponse.json({ error: "Caso não encontrado" }, { status: 404 });
    }
    if (caseRecord.appointment) {
      return NextResponse.json(
        { error: "Este caso já possui um agendamento. Use reagendamento em vez de criar um novo." },
        { status: 409 }
      );
    }
    // Checa o status antes de criar qualquer registro, para não deixar um
    // Appointment "órfão" caso a transição de status não seja permitida
    // (transitionCase roda sua própria transação separada da criação abaixo).
    if (caseRecord.status !== "AGUARDANDO_AGENDAMENTO") {
      return NextResponse.json(
        {
          error:
            "Caso não está aguardando agendamento (status incompatível). O agendamento não foi criado.",
        },
        { status: 409 }
      );
    }

    const city = caseRecord.serviceOrder.customer.city;

    // (a) Data bloqueada (bloqueio específico da cidade OU bloqueio global city=null)
    const blocked = await prisma.blockedDate.findFirst({
      where: { date: dateOnly, OR: [{ city }, { city: null }] },
    });
    if (blocked) {
      return NextResponse.json(
        { error: `Data bloqueada para agendamento${blocked.reason ? `: ${blocked.reason}` : ""}.` },
        { status: 409 }
      );
    }

    // (b) Capacidade por cidade/dia da semana/janela
    const weekday = weekdayOf(dateOnly);
    const rule = await prisma.cityCapacityRule.findFirst({
      where: { city, weekday, windowStart, windowEnd },
    });

    if (rule) {
      const [countDay, countWindow] = await Promise.all([
        prisma.appointment.count({
          where: { date: dateOnly, caseRecord: { serviceOrder: { customer: { city } } } },
        }),
        prisma.appointment.count({
          where: {
            date: dateOnly,
            windowStart,
            windowEnd,
            caseRecord: { serviceOrder: { customer: { city } } },
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
          { error: `Capacidade máxima da janela ${windowStart}-${windowEnd} para ${city} atingida (${rule.maxPerWindow}).` },
          { status: 409 }
        );
      }
    }

    // (c) Cria o agendamento + histórico, e transiciona o caso para AGENDADO.
    // A transição só é válida a partir de AGUARDANDO_AGENDAMENTO — se o caso
    // estiver em outro status, não criamos o agendamento (409), para não deixar
    // o Appointment "órfão" de um caso em status incompatível.
    try {
      const appointment = await prisma.$transaction(async (tx) => {
        const created = await tx.appointment.create({
          data: { caseId, date: dateOnly, windowStart, windowEnd, address, observation },
        });
        await tx.appointmentHistory.create({
          data: {
            appointmentId: created.id,
            changedByUserId: session.sub,
            changeType: "criado",
          },
        });
        return created;
      });

      await transitionCase({
        caseId,
        to: "AGENDADO",
        origin: "GESTOR",
        reason: "Agendamento criado",
        changedByUserId: session.sub,
      });

      await writeAudit({
        userId: session.sub,
        action: "appointment_create",
        entity: "appointments",
        entityId: appointment.id,
        afterData: appointment,
        origin: "gestor",
      });

      return NextResponse.json({ appointment }, { status: 201 });
    } catch (err) {
      if (err instanceof InvalidTransitionError) {
        return NextResponse.json(
          {
            error:
              "Caso não está aguardando agendamento (status incompatível). O agendamento não foi criado.",
          },
          { status: 409 }
        );
      }
      throw err;
    }
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
