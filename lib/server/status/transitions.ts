import type { CaseStatus, StatusChangeOrigin } from "@prisma/client";
import { prisma } from "../db/prisma";

// Transições permitidas por status atual. Um status sem entrada aqui é terminal.
export const ALLOWED_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  IMPORTADO: ["PENDENTE_DISPARO", "CANCELADO"],
  PENDENTE_DISPARO: ["PROCESSANDO_DISPARO", "CANCELADO"],
  PROCESSANDO_DISPARO: ["MENSAGEM_ENVIADA", "PENDENTE_DISPARO"],
  MENSAGEM_ENVIADA: ["MENSAGEM_ENTREGUE", "AGUARDANDO_RESPOSTA", "PENDENTE_DISPARO"],
  MENSAGEM_ENTREGUE: ["MENSAGEM_LIDA", "AGUARDANDO_RESPOSTA"],
  MENSAGEM_LIDA: ["AGUARDANDO_RESPOSTA"],
  AGUARDANDO_RESPOSTA: ["CLIENTE_RESPONDEU", "CONTATO_INVALIDO", "ATENDIMENTO_HUMANO"],
  CLIENTE_RESPONDEU: ["ENDERECO_CONFIRMADO", "ENDERECO_DIVERGENTE", "ATENDIMENTO_HUMANO"],
  ENDERECO_CONFIRMADO: ["AGUARDANDO_AGENDAMENTO", "ATENDIMENTO_HUMANO"],
  ENDERECO_DIVERGENTE: ["ATENDIMENTO_HUMANO", "EM_ATENDIMENTO"],
  ATENDIMENTO_HUMANO: ["EM_ATENDIMENTO"],
  EM_ATENDIMENTO: ["AGUARDANDO_AGENDAMENTO", "CONTATO_INVALIDO", "CLIENTE_RECUSOU", "CANCELADO"],
  AGUARDANDO_AGENDAMENTO: ["AGENDADO"],
  AGENDADO: ["AGUARDANDO_ROTA", "CANCELADO"],
  AGUARDANDO_ROTA: ["ROTA_PLANEJADA"],
  ROTA_PLANEJADA: ["ATRIBUIDO_MOTOBOY"],
  ATRIBUIDO_MOTOBOY: ["EM_DESLOCAMENTO"],
  EM_DESLOCAMENTO: [
    "EQUIPAMENTO_RETIRADO",
    "RETIRADA_NAO_REALIZADA",
    "CLIENTE_AUSENTE",
    "ENDERECO_NAO_LOCALIZADO",
  ],
  EQUIPAMENTO_RETIRADO: ["AGUARDANDO_BAIXA"],
  RETIRADA_NAO_REALIZADA: ["AGUARDANDO_AGENDAMENTO", "CANCELADO"],
  CLIENTE_AUSENTE: ["AGUARDANDO_AGENDAMENTO", "CANCELADO"],
  ENDERECO_NAO_LOCALIZADO: ["ATENDIMENTO_HUMANO", "CANCELADO"],
  CLIENTE_RECUSOU: ["CANCELADO"],
  CONTATO_INVALIDO: ["ATENDIMENTO_HUMANO", "CANCELADO"],
  CANCELADO: [],
  CLIENTE_RETIDO: [],
  AGUARDANDO_BAIXA: ["BAIXA_PROCESSANDO"],
  BAIXA_PROCESSANDO: ["BAIXA_REALIZADA", "ERRO_BAIXA"],
  BAIXA_REALIZADA: ["FINALIZADO"],
  ERRO_BAIXA: ["BAIXA_PROCESSANDO"],
  FINALIZADO: [],
};

export class InvalidTransitionError extends Error {}

export async function transitionCase(params: {
  caseId: string;
  to: CaseStatus;
  origin: StatusChangeOrigin;
  reason?: string;
  note?: string;
  changedByUserId?: string | null;
}) {
  const current = await prisma.caseRecord.findUniqueOrThrow({ where: { id: params.caseId } });

  const allowed = ALLOWED_TRANSITIONS[current.status] ?? [];
  if (!allowed.includes(params.to)) {
    throw new InvalidTransitionError(
      `Transição não permitida: ${current.status} -> ${params.to}`
    );
  }

  return prisma.$transaction([
    prisma.caseRecord.update({ where: { id: params.caseId }, data: { status: params.to } }),
    prisma.caseStatusHistory.create({
      data: {
        caseId: params.caseId,
        fromStatus: current.status,
        toStatus: params.to,
        origin: params.origin,
        reason: params.reason,
        note: params.note,
        changedByUserId: params.changedByUserId ?? null,
      },
    }),
  ]);
}
