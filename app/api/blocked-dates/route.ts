import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, requirePermission, handleAuthError } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";
import { writeAudit } from "@/lib/server/auth/audit";

const bodySchema = z.object({
  city: z.string().min(1).nullable().optional(),
  date: z.string().min(1), // YYYY-MM-DD
  reason: z.string().optional(),
});

export async function GET() {
  try {
    await requireUser();
    const blockedDates = await prisma.blockedDate.findMany({
      orderBy: [{ date: "asc" }],
    });
    return NextResponse.json({ blockedDates });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission("cities_manage");
    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }

    const blockedDate = await prisma.blockedDate.create({
      data: {
        city: parsed.data.city ?? null,
        date: new Date(`${parsed.data.date}T00:00:00.000Z`),
        reason: parsed.data.reason,
      },
    });

    await writeAudit({
      userId: session.sub,
      action: "blocked_date_create",
      entity: "blocked_dates",
      entityId: blockedDate.id,
      afterData: blockedDate,
      origin: "gestor",
    });

    return NextResponse.json({ blockedDate }, { status: 201 });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
