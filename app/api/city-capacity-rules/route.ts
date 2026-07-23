import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, requirePermission, handleAuthError } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";
import { writeAudit } from "@/lib/server/auth/audit";

const bodySchema = z.object({
  city: z.string().min(1),
  weekday: z.number().int().min(0).max(6),
  windowStart: z.string().min(1),
  windowEnd: z.string().min(1),
  maxPerWindow: z.number().int().min(1),
  maxPerDay: z.number().int().min(1),
});

export async function GET() {
  try {
    await requireUser();
    const rules = await prisma.cityCapacityRule.findMany({
      orderBy: [{ city: "asc" }, { weekday: "asc" }, { windowStart: "asc" }],
    });
    return NextResponse.json({ rules });
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

    const rule = await prisma.cityCapacityRule.create({ data: parsed.data });

    await writeAudit({
      userId: session.sub,
      action: "city_capacity_rule_create",
      entity: "city_capacity_rules",
      entityId: rule.id,
      afterData: rule,
      origin: "gestor",
    });

    return NextResponse.json({ rule }, { status: 201 });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { error: "Já existe uma regra para essa cidade/dia da semana/janela." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
