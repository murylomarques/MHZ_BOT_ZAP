import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/server/auth/rbac";
import { writeAudit } from "@/lib/server/auth/audit";
import { runGeocodeBatch, BATCH_SIZE } from "@/lib/server/geocoding/queue";

// Fila de geocodificação (seção 14 do spec): disparo manual, até 50 endereços
// por chamada, respeitando o rate limit de 1 req/s do provider Nominatim.
// Desde a importação, o mesmo lote roda sozinho em segundo plano logo após
// cada upload (ver lib/server/geocoding/queue.ts) — este botão continua
// existindo pra rodar de novo manualmente se quiser (ex: depois de corrigir
// endereços que falharam).
export async function POST() {
  try {
    const session = await requirePermission("couriers_manage");

    const { processed, geocoded, failed } = await runGeocodeBatch();

    await writeAudit({
      userId: session.sub,
      action: "geocode_run",
      entity: "customer_addresses",
      afterData: { processed, geocoded, failed },
      origin: "gestor",
    });

    return NextResponse.json({ processed, geocoded, failed, remaining: processed === BATCH_SIZE });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
