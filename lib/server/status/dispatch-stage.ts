import type { CaseStatus } from "@prisma/client";

// Rotulo de acompanhamento do disparo do bot enquanto o caso aguarda resposta
// do cliente — so visibilidade por enquanto (sem reenvio automatico ainda).
export type DispatchStage =
  | "NAO_DISPARADO"
  | "PRIMEIRO_CONTATO"
  | "FOLLOWUP_24H"
  | "FOLLOWUP_48H"
  | "FOLLOWUP_72H"
  | "LEAD_PERDIDO"
  | "FORA_DO_FUNIL";

export const DISPATCH_STAGE_LABELS: Record<DispatchStage, string> = {
  NAO_DISPARADO: "Não disparado",
  PRIMEIRO_CONTATO: "Primeiro contato",
  FOLLOWUP_24H: "Follow-up 24h",
  FOLLOWUP_48H: "Follow-up 48h",
  FOLLOWUP_72H: "Follow-up 72h",
  LEAD_PERDIDO: "Lead perdido",
  FORA_DO_FUNIL: "-",
};

const NOT_DISPATCHED_STATUSES: CaseStatus[] = ["IMPORTADO", "PENDENTE_DISPARO", "PROCESSANDO_DISPARO"];

// Só faz sentido calcular a etapa de follow-up enquanto o caso está no funil
// de espera de resposta ao disparo — depois disso (CLIENTE_RESPONDEU em
// diante) a etapa deixa de ser relevante.
const WAITING_RESPONSE_STATUSES: CaseStatus[] = [
  "MENSAGEM_ENVIADA",
  "MENSAGEM_ENTREGUE",
  "MENSAGEM_LIDA",
  "AGUARDANDO_RESPOSTA",
];

export function getDispatchStage(status: CaseStatus, lastDispatchAt: Date | null, now: Date = new Date()): DispatchStage {
  if (NOT_DISPATCHED_STATUSES.includes(status)) return "NAO_DISPARADO";
  if (!WAITING_RESPONSE_STATUSES.includes(status)) return "FORA_DO_FUNIL";
  if (!lastDispatchAt) return "PRIMEIRO_CONTATO";

  const hours = (now.getTime() - lastDispatchAt.getTime()) / 3_600_000;
  if (hours < 24) return "PRIMEIRO_CONTATO";
  if (hours < 48) return "FOLLOWUP_24H";
  if (hours < 72) return "FOLLOWUP_48H";
  if (hours < 96) return "FOLLOWUP_72H";
  return "LEAD_PERDIDO";
}
