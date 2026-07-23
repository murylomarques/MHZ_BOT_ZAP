import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/server/auth/rbac";
import { writeAudit } from "@/lib/server/auth/audit";
import { processClosure } from "@/lib/server/closures/process-closure";

const MAX_IDS = 200;

const bodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(MAX_IDS),
  closureCode: z.string().optional(),
});

// POST /api/closures/bulk — baixa em massa (seção 16 do spec). Processa cada
// id sequencialmente (a chamada externa é mockada, mas mesmo assim evitamos
// disparar 200 transações de banco em paralelo) e devolve um resumo
// sucesso/falha por id, sem interromper no primeiro erro.
export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission("closures_manage");
    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }

    const results: { closureId: string; ok: boolean; error?: string }[] = [];
    for (const closureId of parsed.data.ids) {
      try {
        const result = await processClosure({
          closureId,
          closureCode: parsed.data.closureCode,
          userId: session.sub,
        });
        results.push(result);
      } catch (err) {
        results.push({ closureId, ok: false, error: err instanceof Error ? err.message : "Erro" });
      }
    }

    const summary = {
      total: results.length,
      success: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };

    await writeAudit({
      userId: session.sub,
      action: "closure_bulk_process",
      entity: "system_closures",
      afterData: summary,
      origin: "gestor",
    });

    return NextResponse.json(summary);
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
