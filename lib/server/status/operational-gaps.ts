import { prisma } from "@/lib/server/db/prisma";
import { getCityCoverage } from "./motoboy-dashboard";

export type MotoboyGapCity = { city: string; pendingCount: number };
export type RetiradaGapCity = { city: string; total: number; successRate: number };
export type AgendamentoGapCity = { city: string; stuckCount: number };

// Cidades com demanda de retirada e nenhum motoboy ativo cobrindo — mesma
// base de lib/server/status/motoboy-dashboard.ts, só filtrando pro que
// interessa aqui (a lacuna em si, não a lista inteira de cobertura).
export async function getMotoboyGap(): Promise<MotoboyGapCity[]> {
  const coverage = await getCityCoverage();
  return coverage
    .filter((c) => !c.hasActiveCourier)
    .map((c) => ({ city: c.city, pendingCount: c.pendingCount }));
}

const MIN_ATTEMPTS = 5;
const SUCCESS_THRESHOLD = 0.7;

// Cidades com taxa de sucesso de retirada baixa nos últimos 7 dias
// (retirado vs não realizado) — sinaliza onde a execução está falhando,
// não só a cobertura de motoboy.
export async function getRetiradaGap(): Promise<RetiradaGapCity[]> {
  const rows = await prisma.$queryRaw<{ city: string; total: bigint; realizadas: bigint }[]>`
    SELECT c.city,
           count(*) AS total,
           count(*) FILTER (WHERE p.result = 'retirado') AS realizadas
    FROM pickups p
    JOIN case_records cr ON cr.id = p.case_id
    JOIN service_orders so ON so.id = cr.service_order_id
    JOIN customers c ON c.id = so.customer_id
    WHERE p.performed_at >= now() - interval '7 days'
    GROUP BY c.city
    HAVING count(*) >= ${MIN_ATTEMPTS}
  `;
  return rows
    .map((r) => ({ city: r.city, total: Number(r.total), successRate: Number(r.realizadas) / Number(r.total) }))
    .filter((r) => r.successRate < SUCCESS_THRESHOLD)
    .sort((a, b) => a.successRate - b.successRate);
}

const STUCK_STATUSES = ["CLIENTE_RESPONDEU", "ENDERECO_CONFIRMADO", "AGUARDANDO_AGENDAMENTO"] as const;
const STUCK_HOURS = 24;

// Cidades com clientes que já responderam (ou confirmaram endereço) mas
// ainda não foram agendados há mais de 24h — sinaliza onde falta fechar
// agendamento, não é falta de motoboy nem de execução de retirada.
export async function getAgendamentoGap(): Promise<AgendamentoGapCity[]> {
  const threshold = new Date(Date.now() - STUCK_HOURS * 60 * 60 * 1000);
  const rows = await prisma.$queryRaw<{ city: string; count: bigint }[]>`
    SELECT c.city, count(*) AS count
    FROM case_records cr
    JOIN service_orders so ON so.id = cr.service_order_id
    JOIN customers c ON c.id = so.customer_id
    WHERE cr.status::text = ANY(${STUCK_STATUSES}::text[]) AND cr.updated_at < ${threshold}
    GROUP BY c.city
    ORDER BY count DESC
  `;
  return rows.map((r) => ({ city: r.city, stuckCount: Number(r.count) }));
}
