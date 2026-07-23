import type { CaseStatus } from "@prisma/client";

// Esquema de cores do mapa (seção 14 do spec): 8 grupos visuais distintos.
// Como o `CaseStatus` do banco tem 29 valores (todo o funil, desde o disparo
// do bot), agrupamos os status "de logística" (os que realmente aparecem no
// mapa, pois só eles têm chance de ter endereço geocodificado) nos 8 baldes
// pedidos, e os status anteriores ao agendamento (bot/atendimento) num grupo
// neutro extra — eles não deveriam aparecer no mapa na prática, mas o mapa não
// quebra se aparecerem.
export const MAP_STATUS_GROUPS = {
  pendente_agendamento: { label: "Pendente agendamento", color: "#f59e0b" }, // âmbar
  agendado: { label: "Agendado", color: "#3b82f6" }, // azul
  sem_motoboy: { label: "Sem motoboy", color: "#eab308" }, // amarelo
  rota_criada: { label: "Rota criada", color: "#8b5cf6" }, // roxo
  em_andamento: { label: "Em andamento", color: "#06b6d4" }, // ciano
  retirado: { label: "Retirado", color: "#22c55e" }, // verde
  nao_retirado: { label: "Não retirado", color: "#ef4444" }, // vermelho
  aguardando_baixa: { label: "Aguardando baixa", color: "#6366f1" }, // índigo
  outro: { label: "Outro (pré-agendamento)", color: "#9ca3af" }, // cinza
} as const;

export type MapStatusGroup = keyof typeof MAP_STATUS_GROUPS;

const STATUS_TO_GROUP: Record<CaseStatus, MapStatusGroup> = {
  IMPORTADO: "outro",
  PENDENTE_DISPARO: "outro",
  PROCESSANDO_DISPARO: "outro",
  MENSAGEM_ENVIADA: "outro",
  MENSAGEM_ENTREGUE: "outro",
  MENSAGEM_LIDA: "outro",
  AGUARDANDO_RESPOSTA: "outro",
  CLIENTE_RESPONDEU: "outro",
  ENDERECO_CONFIRMADO: "outro",
  ENDERECO_DIVERGENTE: "outro",
  ATENDIMENTO_HUMANO: "outro",
  EM_ATENDIMENTO: "outro",
  AGUARDANDO_AGENDAMENTO: "pendente_agendamento",
  AGENDADO: "agendado",
  AGUARDANDO_ROTA: "sem_motoboy",
  ROTA_PLANEJADA: "rota_criada",
  ATRIBUIDO_MOTOBOY: "rota_criada",
  EM_DESLOCAMENTO: "em_andamento",
  EQUIPAMENTO_RETIRADO: "retirado",
  RETIRADA_NAO_REALIZADA: "nao_retirado",
  CLIENTE_AUSENTE: "nao_retirado",
  ENDERECO_NAO_LOCALIZADO: "nao_retirado",
  CLIENTE_RECUSOU: "nao_retirado",
  CONTATO_INVALIDO: "outro",
  CANCELADO: "outro",
  CLIENTE_RETIDO: "outro",
  AGUARDANDO_BAIXA: "aguardando_baixa",
  BAIXA_PROCESSANDO: "aguardando_baixa",
  BAIXA_REALIZADA: "aguardando_baixa",
  ERRO_BAIXA: "aguardando_baixa",
  FINALIZADO: "aguardando_baixa",
};

export function statusToMapGroup(status: CaseStatus): MapStatusGroup {
  return STATUS_TO_GROUP[status] ?? "outro";
}

export function statusToMapColor(status: CaseStatus): string {
  return MAP_STATUS_GROUPS[statusToMapGroup(status)].color;
}
