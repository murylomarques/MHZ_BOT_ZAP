import type { CaseStatus } from "@prisma/client";

// Visão simplificada para o atendente: o modelo interno tem ~29 status (para
// o funil completo/dashboard), mas quem está na Central de Atendimento só
// precisa pensar em 3 buckets, conforme pedido pelo negócio.
export type AttendantStatus = "NAO_AGENDADO" | "AGENDADO" | "DIVERGENTE";

export const ATTENDANT_STATUS_LABELS: Record<AttendantStatus, string> = {
  NAO_AGENDADO: "Não agendado",
  AGENDADO: "Agendado",
  DIVERGENTE: "Divergente",
};

const AGENDADO_STATUSES: CaseStatus[] = [
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

const DIVERGENTE_STATUSES: CaseStatus[] = [
  "ENDERECO_DIVERGENTE",
  "ENDERECO_NAO_LOCALIZADO",
  "CONTATO_INVALIDO",
  "CLIENTE_RECUSOU",
  "CANCELADO",
  "RETIRADA_NAO_REALIZADA",
  "CLIENTE_AUSENTE",
];

export function toAttendantStatus(status: CaseStatus): AttendantStatus {
  if (AGENDADO_STATUSES.includes(status)) return "AGENDADO";
  if (DIVERGENTE_STATUSES.includes(status)) return "DIVERGENTE";
  return "NAO_AGENDADO";
}
