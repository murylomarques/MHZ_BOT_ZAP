import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";
import { writeAudit } from "@/lib/server/auth/audit";

const coverageSchema = z.object({ city: z.string().min(1), district: z.string().optional() });

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  document: z.string().optional().nullable(),
  status: z.enum(["ATIVO", "INATIVO"]).optional(),
  vehicleType: z.string().optional().nullable(),
  plate: z.string().optional().nullable(),
  dailyCapacity: z.number().int().min(0).optional().nullable(),
  observation: z.string().optional().nullable(),
  coverage: z.array(coverageSchema).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("couriers_manage");
    const { id } = await params;

    const json = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }
    const { coverage, ...data } = parsed.data;

    const existing = await prisma.courier.findUnique({ where: { id }, include: { coverage: true } });
    if (!existing) {
      return NextResponse.json({ error: "Motoboy não encontrado" }, { status: 404 });
    }

    const courier = await prisma.$transaction(async (tx) => {
      const updatedCourier = await tx.courier.update({ where: { id }, data });

      if (coverage !== undefined) {
        await tx.courierCoverage.deleteMany({ where: { courierId: id } });
        if (coverage.length > 0) {
          await tx.courierCoverage.createMany({ data: coverage.map((c) => ({ ...c, courierId: id })) });
        }
      }

      return tx.courier.findUnique({ where: { id }, include: { coverage: true } });
    });

    await writeAudit({
      userId: session.sub,
      action: "courier_update",
      entity: "couriers",
      entityId: id,
      beforeData: existing,
      afterData: courier,
      origin: session.role.toLowerCase(),
    });

    return NextResponse.json({ courier });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
