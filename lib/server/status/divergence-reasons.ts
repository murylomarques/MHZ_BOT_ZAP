import type { CaseStatus } from "@prisma/client";

export type DivergenceReason = {
  code: string;
  label: string;
  targetStatus: CaseStatus;
};

// Motivos de "Divergente" — cada um encerra o caso com o status interno mais
// adequado, mantendo o funil/relatórios corretos por trás da visão simples
// que o atendente vê (só "Divergente").
export const DIVERGENCE_REASONS: DivergenceReason[] = [
  { code: "FORA_AREA", label: "Não mora na área de atuação", targetStatus: "CANCELADO" },
  { code: "EQUIPAMENTO_DESCARTADO", label: "Cliente jogou o equipamento fora / não tem mais", targetStatus: "CANCELADO" },
  { code: "ENDERECO_NAO_LOCALIZADO", label: "Endereço não localizado", targetStatus: "ENDERECO_NAO_LOCALIZADO" },
  { code: "CONTATO_INVALIDO", label: "Contato inválido / número errado", targetStatus: "CONTATO_INVALIDO" },
  { code: "CLIENTE_RECUSOU", label: "Cliente recusou a retirada", targetStatus: "CLIENTE_RECUSOU" },
  { code: "OUTRO", label: "Outro motivo", targetStatus: "CANCELADO" },
];

export function findDivergenceReason(code: string): DivergenceReason | undefined {
  return DIVERGENCE_REASONS.find((r) => r.code === code);
}
