import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";
import { writeAudit } from "@/lib/server/auth/audit";

const coverageSchema = z.object({ city: z.string().min(1), district: z.string().optional() });

const createSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  document: z.string().optional(),
  vehicleType: z.string().optional(),
  plate: z.string().optional(),
  dailyCapacity: z.number().int().min(0).optional(),
  observation: z.string().optional(),
  coverage: z.array(coverageSchema).optional(),
});

export async function GET() {
  try {
    await requirePermission("couriers_manage");
    const couriers = await prisma.courier.findMany({
      include: { coverage: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ couriers });
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
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }
    const { coverage, ...data } = parsed.data;

    const courier = await prisma.courier.create({
      data: {
        ...data,
        coverage: coverage && coverage.length > 0 ? { createMany: { data: coverage } } : undefined,
      },
      include: { coverage: true },
    });

    await writeAudit({
      userId: session.sub,
      action: "courier_create",
      entity: "couriers",
      entityId: courier.id,
      afterData: courier,
      origin: session.role.toLowerCase(),
    });

    return NextResponse.json({ courier }, { status: 201 });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
