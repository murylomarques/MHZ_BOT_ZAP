import type { CaseStatus } from "@prisma/client";
import { prisma } from "@/lib/server/db/prisma";

// Simplificação: consideramos "respondido" qualquer caso da campanha que já
// passou por CLIENTE_RESPONDEU ou por qualquer status posterior no fluxo
// (a máquina de estados é progressiva — ver lib/server/status/transitions.ts).
// "Agendado" é um subconjunto disso (a partir de AGENDADO).
export const RESPONDED_STATUSES: CaseStatus[] = [
  "CLIENTE_RESPONDEU",
  "ENDERECO_CONFIRMADO",
  "ENDERECO_DIVERGENTE",
  "ATENDIMENTO_HUMANO",
  "EM_ATENDIMENTO",
  "AGUARDANDO_AGENDAMENTO",
  "AGENDADO",
  "AGUARDANDO_ROTA",
  "ROTA_PLANEJADA",
  "ATRIBUIDO_MOTOBOY",
  "EM_DESLOCAMENTO",
  "EQUIPAMENTO_RETIRADO",
  "RETIRADA_NAO_REALIZADA",
  "CLIENTE_AUSENTE",
  "ENDERECO_NAO_LOCALIZADO",
  "CLIENTE_RECUSOU",
  "AGUARDANDO_BAIXA",
  "BAIXA_PROCESSANDO",
  "BAIXA_REALIZADA",
  "ERRO_BAIXA",
  "FINALIZADO",
];

export const SCHEDULED_STATUSES: CaseStatus[] = [
  "AGENDADO",
  "AGUARDANDO_ROTA",
  "ROTA_PLANEJADA",
  "ATRIBUIDO_MOTOBOY",
  "EM_DESLOCAMENTO",
  "EQUIPAMENTO_RETIRADO",
  "AGUARDANDO_BAIXA",
  "BAIXA_PROCESSANDO",
  "BAIXA_REALIZADA",
  "FINALIZADO",
];

export type CampaignIndicators = {
  totalSelecionado: number;
  pendente: number;
  processando: number;
  enviado: number;
  erro: number;
  ignorado: number;
  duplicado: number;
  entregue: number;
  lido: number;
  respondido: number;
  agendado: number;
  taxaEnvio: number;
  taxaResposta: number;
  taxaAgendamento: number;
};

export async function getCampaignIndicators(campaignId: string): Promise<CampaignIndicators> {
  const [itemsByStatus, messagesByStatus, respondidoCount, agendadoCount] = await Promise.all([
    prisma.botCampaignItem.groupBy({ by: ["status"], where: { campaignId }, _count: { _all: true } }),
    prisma.botMessage.groupBy({ by: ["status"], where: { campaignId }, _count: { _all: true } }),
    prisma.caseRecord.count({ where: { campaignId, status: { in: RESPONDED_STATUSES } } }),
    prisma.caseRecord.count({ where: { campaignId, status: { in: SCHEDULED_STATUSES } } }),
  ]);

  const itemCount = (s: string) => itemsByStatus.find((r) => r.status === s)?._count._all ?? 0;
  const msgCount = (s: string) => messagesByStatus.find((r) => r.status === s)?._count._all ?? 0;

  const totalSelecionado = itemsByStatus.reduce((acc, r) => acc + r._count._all, 0);
  const enviado = itemCount("ENVIADO");
  const lido = msgCount("LIDO");
  // "lido" implica "entregue" — soma para não subcontar quem já leu.
  const entregue = msgCount("ENTREGUE") + lido;

  return {
    totalSelecionado,
    pendente: itemCount("PENDENTE"),
    processando: itemCount("PROCESSANDO"),
    enviado,
    erro: itemCount("ERRO"),
    ignorado: itemCount("IGNORADO"),
    duplicado: itemCount("DUPLICADO"),
    entregue,
    lido,
    respondido: respondidoCount,
    agendado: agendadoCount,
    taxaEnvio: totalSelecionado > 0 ? enviado / totalSelecionado : 0,
    taxaResposta: enviado > 0 ? respondidoCount / enviado : 0,
    taxaAgendamento: enviado > 0 ? agendadoCount / enviado : 0,
  };
}
