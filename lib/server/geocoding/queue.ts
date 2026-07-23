import { prisma } from "../db/prisma";
import { geocodingProvider } from "../providers/geocoding-provider";

export const BATCH_SIZE = 50;

export type GeocodeBatchResult = { processed: number; geocoded: number; failed: number };

// Um lote da fila de geocodificação: pega até BATCH_SIZE endereços pendentes
// (nunca tentados, ou tentados há mais de 30min — evita travar pra sempre
// tentando repetidamente o mesmo endereço que nunca vai ser encontrado) e
// geocodifica um por um, respeitando o rate limit de 1 req/s do Nominatim
// (aplicado dentro de geocodingProvider).
export async function runGeocodeBatch(): Promise<GeocodeBatchResult> {
  const pending = await prisma.$queryRaw<{ id: string; fullAddress: string }[]>`
    SELECT ca.id, ca.full_address as "fullAddress"
    FROM customer_addresses ca
    WHERE ca.latitude IS NULL
      AND (ca.geocoded_at IS NULL OR ca.geocoded_at < now() - interval '30 minutes')
    ORDER BY ca.created_at ASC
    LIMIT ${BATCH_SIZE}
  `;

  let geocoded = 0;
  let failed = 0;

  for (const addr of pending) {
    try {
      const result = await geocodingProvider.geocode(addr.fullAddress);
      if (result) {
        await prisma.customerAddress.update({
          where: { id: addr.id },
          data: { latitude: result.lat, longitude: result.lng, geocodedAt: new Date() },
        });
        geocoded++;
      } else {
        await prisma.customerAddress.update({ where: { id: addr.id }, data: { geocodedAt: new Date() } });
        failed++;
      }
    } catch {
      await prisma.customerAddress.update({ where: { id: addr.id }, data: { geocodedAt: new Date() } }).catch(() => {});
      failed++;
    }
  }

  return { processed: pending.length, geocoded, failed };
}

let running = false;

// Roda a fila até esvaziar, em segundo plano — usado depois de uma
// importação pra não depender de alguém lembrar de clicar em "Rodar fila" no
// mapa. Guardado por uma flag em memória pra nunca ter duas rodadas
// concorrentes (ex: import + clique manual ao mesmo tempo).
// Atenção: isso só funciona em servidor de longa duração (dev local, VPS) —
// em função serverless (ex: Vercel) o processo é encerrado quando a resposta
// HTTP termina, então o loop não continua depois disso.
export function runGeocodeQueueInBackground(): void {
  if (running) return;
  running = true;

  (async () => {
    try {
      while (true) {
        const result = await runGeocodeBatch();
        if (result.processed === 0) break;
      }
    } catch (err) {
      console.error("[geocode-queue] erro no loop em segundo plano:", err instanceof Error ? err.message : err);
    } finally {
      running = false;
    }
  })();
}
