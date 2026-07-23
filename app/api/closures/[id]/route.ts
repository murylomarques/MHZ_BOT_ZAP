import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";
import { writeAudit } from "@/lib/server/auth/audit";
import { processClosure } from "@/lib/server/closures/process-closure";

const bodySchema = z.object({
  closureCode: z.string().optional(),
  observation: z.string().optional(),
});

// PATCH /api/closures/[id] — dá baixa individual (seção 16 do spec).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("closures_manage");
    const { id } = await params;
    const json = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }

    const result = await processClosure({
      closureId: id,
      closureCode: parsed.data.closureCode,
      observation: parsed.data.observation,
      userId: session.sub,
    });

    await writeAudit({
      userId: session.sub,
      action: "closure_process",
      entity: "system_closures",
      entityId: id,
      afterData: result,
      origin: "gestor",
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? "Falha ao dar baixa" }, { status: 409 });
    }

    const closure = await prisma.systemClosure.findUnique({ where: { id } });
    return NextResponse.json({ closure });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
