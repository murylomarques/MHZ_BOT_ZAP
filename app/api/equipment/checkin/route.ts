import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";
import { writeAudit } from "@/lib/server/auth/audit";

const bodySchema = z.object({ code: z.string().min(1) });

// POST /api/equipment/checkin — "bipar" o equipamento de volta na base
// (por MAC ou por SA). Marca o equipamento como devolvido e, se for o
// último pendente daquele pickup, libera o SystemClosure de
// AGUARDANDO_DEVOLUCAO pra AGUARDANDO (agora sim elegível pra baixa).
export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission("closures_manage");
    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Código inválido" }, { status: 400 });
    }
    const code = parsed.data.code.trim();

    const equipment = await prisma.pickupEquipment.findFirst({
      where: {
        returnedToBaseAt: null,
        OR: [
          { macAddress: { equals: code, mode: "insensitive" } },
          { pickup: { caseRecord: { serviceOrder: { is: { saId: { equals: code, mode: "insensitive" } } } } } },
        ],
      },
      include: {
        pickup: {
          include: {
            courier: true,
            caseRecord: { include: { serviceOrder: true } },
          },
        },
      },
    });

    if (!equipment) {
      return NextResponse.json(
        { error: "Nenhum equipamento pendente de devolução encontrado com esse código." },
        { status: 404 }
      );
    }

    await prisma.pickupEquipment.update({
      where: { id: equipment.id },
      data: { returnedToBaseAt: new Date(), returnedToBaseByUserId: session.sub },
    });

    const remaining = await prisma.pickupEquipment.count({
      where: { pickupId: equipment.pickupId, returnedToBaseAt: null },
    });

    let closureReleased = false;
    if (remaining === 0) {
      const closure = await prisma.systemClosure.findUnique({ where: { pickupId: equipment.pickupId } });
      if (closure?.status === "AGUARDANDO_DEVOLUCAO") {
        await prisma.systemClosure.update({ where: { id: closure.id }, data: { status: "AGUARDANDO" } });
        closureReleased = true;
      }
    }

    await writeAudit({
      userId: session.sub,
      action: "equipment_checkin",
      entity: "pickup_equipment",
      entityId: equipment.id,
      afterData: { code, closureReleased },
      origin: "gestor",
    });

    return NextResponse.json({
      ok: true,
      equipment: {
        type: equipment.type,
        macAddress: equipment.macAddress,
        saId: equipment.pickup.caseRecord.serviceOrder.saId,
        courierName: equipment.pickup.courier?.name ?? "Sem motoboy vinculado",
      },
      remainingForPickup: remaining,
      closureReleased,
    });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
