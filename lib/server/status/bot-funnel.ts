import { prisma } from "@/lib/server/db/prisma";

// Cada estado da conversa do bot (lib/conversation.js) é logado como um
// evento em bot_funnel_events assim que o cliente completa o passo anterior
// (ver goTo() em conversation.js). O rótulo aqui descreve a AÇÃO do cliente
// que faz o bot entrar nesse estado — não o estado em si.
export type FunnelStep = { key: string; label: string };

export const RETIRADA_FUNNEL: FunnelStep[] = [
  { key: "DISPARADO", label: "Mensagem enviada" },
  { key: "AWAITING_RETENTION_OFFER", label: "Respondeu (motivo selecionado)" },
  { key: "AWAITING_RETENTION_LASTCHANCE", label: "Recusou a oferta de retenção" },
  { key: "AWAITING_DATE", label: "Seguiu para agendar a retirada" },
  { key: "AWAITING_PERIOD", label: "Escolheu o dia" },
  { key: "AWAITING_ADDRESS_CONFIRM", label: "Escolheu o período/horário" },
  // AWAITING_ADDRESS (digitar/corrigir endereço) é um desvio opcional — quem
  // confirma "sim" no endereço já cadastrado pula direto pra cá, então não
  // entra como etapa obrigatória do funil (senão pareceria abandono onde não tem).
  { key: "AWAITING_PHONE", label: "Confirmou/corrigiu o endereço" },
  { key: "AWAITING_OBSERVATION", label: "Informou telefone alternativo" },
  { key: "AWAITING_CONFIRM", label: "Informou observação" },
  { key: "RETIRADA_CONFIRMADA", label: "Confirmou a retirada" },
];

export const RETENCAO_FUNNEL: FunnelStep[] = [
  { key: "DISPARADO", label: "Mensagem enviada" },
  { key: "AWAITING_RETENTION_OFFER", label: "Respondeu (motivo selecionado)" },
  { key: "AWAITING_RET_NOME", label: "Aceitou a oferta (quer continuar)" },
  { key: "AWAITING_RET_CPF", label: "Informou nome completo" },
  { key: "AWAITING_RET_RG", label: "Informou CPF" },
  { key: "AWAITING_RET_NASCIMENTO", label: "Informou RG" },
  { key: "AWAITING_RET_MAE", label: "Informou data de nascimento" },
  { key: "AWAITING_RET_EMAIL", label: "Informou nome da mãe" },
  { key: "AWAITING_RET_ENDERECO", label: "Informou e-mail" },
  { key: "AWAITING_RET_PLANO", label: "Informou endereço" },
  { key: "AWAITING_RET_TEL1", label: "Informou plano de interesse" },
  { key: "AWAITING_RET_TEL2", label: "Informou telefone 1" },
  { key: "RETENCAO_CONCLUIDA", label: "Informou telefone 2 (concluiu)" },
];

export type FunnelResultStage = FunnelStep & { count: number; dropFromPrevious: number };

export type FunnelResult = {
  stages: FunnelResultStage[];
  worstDropIndex: number | null; // índice (em stages) do maior abandono, ou null se não houver dado suficiente
};

// bot_messages não tem telefone direto (só case_id) — bot_funnel_events é
// por wa_id (o bot legado só conhece o telefone). Usamos contagem de casos
// disparados como base da etapa 0: 1 caso = 1 telefone, então dá pra
// comparar com as etapas seguintes (por wa_id) sem distorcer o funil.
async function countDispatched(): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT count(DISTINCT case_id) AS count FROM bot_messages WHERE direction = 'outbound' AND case_id IS NOT NULL
  `;
  return Number(rows[0]?.count ?? 0);
}

async function countByStep(steps: string[]): Promise<Map<string, number>> {
  if (steps.length === 0) return new Map();
  const rows = await prisma.$queryRaw<{ step: string; count: bigint }[]>`
    SELECT step, count(DISTINCT wa_id) AS count
    FROM bot_funnel_events
    WHERE step = ANY(${steps}::text[])
    GROUP BY step
  `;
  return new Map(rows.map((r) => [r.step, Number(r.count)]));
}

// bot_funnel_events só existe a partir de agora — casos antigos que já
// responderam/agendaram/foram retidos antes dessa instrumentação existir
// ficariam com contagem 0 nos marcos abaixo. Como esses 3 marcos têm um
// equivalente confiável em case_status_history (independe de quando o
// evento foi logado), usamos o maior valor entre as duas fontes.
const HISTORICAL_STATUS_FOR_STEP: Record<string, string> = {
  AWAITING_RETENTION_OFFER: "CLIENTE_RESPONDEU",
  RETIRADA_CONFIRMADA: "AGENDADO",
  RETENCAO_CONCLUIDA: "CLIENTE_RETIDO",
};

async function countHistoricalReached(statuses: string[]): Promise<Map<string, number>> {
  if (statuses.length === 0) return new Map();
  const rows = await prisma.$queryRaw<{ status: string; count: bigint }[]>`
    WITH stage_events AS (
      SELECT case_id, to_status::text AS status FROM case_status_history
      UNION
      SELECT id AS case_id, status::text FROM case_records
    )
    SELECT status, count(DISTINCT case_id) AS count
    FROM stage_events
    WHERE status = ANY(${statuses}::text[])
    GROUP BY status
  `;
  return new Map(rows.map((r) => [r.status, Number(r.count)]));
}

function buildFunnelResult(definition: FunnelStep[], dispatched: number, stepCounts: Map<string, number>): FunnelResult {
  let worstDropIndex: number | null = null;
  let worstDropPct = -1;

  const stages: FunnelResultStage[] = definition.map((stage, i) => {
    const count = stage.key === "DISPARADO" ? dispatched : stepCounts.get(stage.key) ?? 0;
    const previousCount = i === 0 ? count : definition[i - 1].key === "DISPARADO" ? dispatched : stepCounts.get(definition[i - 1].key) ?? 0;
    const dropFromPrevious = i === 0 || previousCount === 0 ? 0 : Math.round((1 - count / previousCount) * 100);
    if (i > 0 && previousCount > 0 && dropFromPrevious > worstDropPct) {
      worstDropPct = dropFromPrevious;
      worstDropIndex = i;
    }
    return { ...stage, count, dropFromPrevious };
  });

  return { stages, worstDropIndex };
}

export async function getBotFunnels(): Promise<{ retirada: FunnelResult; retencao: FunnelResult }> {
  const allStepKeys = Array.from(
    new Set([...RETIRADA_FUNNEL, ...RETENCAO_FUNNEL].map((s) => s.key).filter((k) => k !== "DISPARADO"))
  );
  const historicalStatuses = Object.values(HISTORICAL_STATUS_FOR_STEP);

  const [dispatched, stepCounts, historicalCounts] = await Promise.all([
    countDispatched(),
    countByStep(allStepKeys),
    countHistoricalReached(historicalStatuses),
  ]);

  for (const [step, status] of Object.entries(HISTORICAL_STATUS_FOR_STEP)) {
    const historical = historicalCounts.get(status) ?? 0;
    const fromEvents = stepCounts.get(step) ?? 0;
    stepCounts.set(step, Math.max(historical, fromEvents));
  }

  return {
    retirada: buildFunnelResult(RETIRADA_FUNNEL, dispatched, stepCounts),
    retencao: buildFunnelResult(RETENCAO_FUNNEL, dispatched, stepCounts),
  };
}
