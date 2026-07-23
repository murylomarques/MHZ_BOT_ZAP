import { prisma } from "@/lib/server/db/prisma";
import { STATUS_LABELS } from "@/lib/server/status/labels";
import type { CaseStatus } from "@prisma/client";

export type ReportKey =
  | "funil"
  | "disparos"
  | "erros"
  | "conversao"
  | "retiradas"
  | "equipamentos"
  | "baixas"
  | "sla"
  | "base";

export const REPORTS: { key: ReportKey; title: string; description: string }[] = [
  { key: "funil", title: "Funil operacional", description: "Quantidade de casos por status" },
  { key: "disparos", title: "Disparos do bot", description: "Mensagens do bot por status e provedor" },
  { key: "erros", title: "Erros do bot", description: "Mensagens com erro, agrupadas pelo motivo" },
  {
    key: "conversao",
    title: "Conversão por cidade",
    description: "Casos por cidade x quantos chegaram a endereço confirmado (ou além)",
  },
  { key: "retiradas", title: "Retiradas", description: "Retiradas realizadas x não realizadas" },
  { key: "equipamentos", title: "Equipamentos retirados", description: "Equipamentos retirados por tipo" },
  { key: "baixas", title: "Baixas", description: "Baixas por status" },
  {
    key: "sla",
    title: "Casos fora do SLA",
    description: "Casos com SLA vencido, ainda não finalizados/cancelados",
  },
  { key: "base", title: "Base completa com histórico", description: "Exportação completa de casos" },
];

export function isReportKey(v: string): v is ReportKey {
  return REPORTS.some((r) => r.key === v);
}

export type DateRange = { from: Date; to: Date };

// Padrão: sem filtro informado, cobre toda a base (desde antes da 1ª importação
// até o fim do dia de hoje).
export function parseDateRange(from?: string, to?: string): DateRange {
  const fromDate = from ? new Date(`${from}T00:00:00`) : new Date("2000-01-01T00:00:00");
  const toDate = to ? new Date(`${to}T23:59:59.999`) : new Date();
  return { from: fromDate, to: toDate };
}

// Status anteriores à confirmação de endereço — usado no relatório de conversão.
const PRE_CONFIRMATION_STATUSES: CaseStatus[] = [
  "IMPORTADO",
  "PENDENTE_DISPARO",
  "PROCESSANDO_DISPARO",
  "MENSAGEM_ENVIADA",
  "MENSAGEM_ENTREGUE",
  "MENSAGEM_LIDA",
  "AGUARDANDO_RESPOSTA",
  "CLIENTE_RESPONDEU",
];

const TERMINAL_STATUSES: CaseStatus[] = ["FINALIZADO", "CANCELADO"];

export type ReportResult = {
  title: string;
  headers: string[];
  rows: (string | number | null)[][];
  totalCount?: number; // só preenchido nos relatórios paginados (base)
};

export async function getReportData(
  key: ReportKey,
  range: DateRange,
  opts?: { page?: number; pageSize?: number; limit?: number }
): Promise<ReportResult> {
  switch (key) {
    case "funil": {
      const rows = await prisma.caseRecord.groupBy({
        by: ["status"],
        where: { createdAt: { gte: range.from, lte: range.to } },
        _count: { _all: true },
      });
      rows.sort((a, b) => b._count._all - a._count._all);
      return {
        title: "Funil operacional",
        headers: ["Status", "Quantidade"],
        rows: rows.map((r) => [STATUS_LABELS[r.status], r._count._all]),
      };
    }

    case "disparos": {
      const rows = await prisma.botMessage.groupBy({
        by: ["provider", "status"],
        where: { createdAt: { gte: range.from, lte: range.to } },
        _count: { _all: true },
      });
      rows.sort((a, b) => b._count._all - a._count._all);
      return {
        title: "Disparos do bot",
        headers: ["Provedor", "Status", "Quantidade"],
        rows: rows.map((r) => [r.provider, r.status, r._count._all]),
      };
    }

    case "erros": {
      const rows = await prisma.botMessage.groupBy({
        by: ["errorMessage"],
        where: { status: "ERRO", createdAt: { gte: range.from, lte: range.to } },
        _count: { _all: true },
      });
      rows.sort((a, b) => b._count._all - a._count._all);
      return {
        title: "Erros do bot",
        headers: ["Motivo do erro", "Quantidade"],
        rows: rows.map((r) => [r.errorMessage ?? "(sem mensagem)", r._count._all]),
      };
    }

    case "conversao": {
      const cityRows = await prisma.$queryRaw<{ city: string; total: bigint; confirmed: bigint }[]>`
        select c.city as city,
               count(*) as total,
               count(*) filter (
                 where cr.status not in (
                   'IMPORTADO','PENDENTE_DISPARO','PROCESSANDO_DISPARO','MENSAGEM_ENVIADA',
                   'MENSAGEM_ENTREGUE','MENSAGEM_LIDA','AGUARDANDO_RESPOSTA','CLIENTE_RESPONDEU'
                 )
               ) as confirmed
        from case_records cr
        join service_orders so on so.id = cr.service_order_id
        join customers c on c.id = so.customer_id
        where cr.created_at between ${range.from} and ${range.to}
        group by c.city
        order by total desc
      `;
      return {
        title: "Conversão por cidade",
        headers: ["Cidade", "Total de casos", "Endereço confirmado (ou além)", "Taxa de conversão"],
        rows: cityRows.map((r) => {
          const total = Number(r.total);
          const confirmed = Number(r.confirmed);
          const rate = total > 0 ? `${((confirmed / total) * 100).toFixed(1)}%` : "-";
          return [r.city, total, confirmed, rate];
        }),
      };
    }

    case "retiradas": {
      const rows = await prisma.pickup.groupBy({
        by: ["result"],
        where: { createdAt: { gte: range.from, lte: range.to } },
        _count: { _all: true },
      });
      rows.sort((a, b) => b._count._all - a._count._all);
      return {
        title: "Retiradas",
        headers: ["Resultado", "Quantidade"],
        rows: rows.map((r) => [r.result ?? "(pendente)", r._count._all]),
      };
    }

    case "equipamentos": {
      const rows = await prisma.pickupEquipment.groupBy({
        by: ["type"],
        where: { pickup: { is: { createdAt: { gte: range.from, lte: range.to } } } },
        _count: { _all: true },
        _sum: { quantity: true },
      });
      rows.sort((a, b) => b._count._all - a._count._all);
      return {
        title: "Equipamentos retirados",
        headers: ["Tipo", "Itens (linhas)", "Quantidade total"],
        rows: rows.map((r) => [r.type, r._count._all, r._sum.quantity ?? 0]),
      };
    }

    case "baixas": {
      const rows = await prisma.systemClosure.groupBy({
        by: ["status"],
        where: { createdAt: { gte: range.from, lte: range.to } },
        _count: { _all: true },
      });
      rows.sort((a, b) => b._count._all - a._count._all);
      return {
        title: "Baixas",
        headers: ["Status", "Quantidade"],
        rows: rows.map((r) => [r.status, r._count._all]),
      };
    }

    case "sla": {
      const take = opts?.limit ?? 500;
      const cases = await prisma.caseRecord.findMany({
        where: {
          slaDueAt: { lt: new Date() },
          status: { notIn: TERMINAL_STATUSES },
          createdAt: { gte: range.from, lte: range.to },
        },
        include: { serviceOrder: { include: { customer: true } } },
        orderBy: { slaDueAt: "asc" },
        take,
      });
      return {
        title: "Casos fora do SLA",
        headers: ["Cliente", "Telefone", "Cidade", "SA", "WO", "Status", "SLA vencido em"],
        rows: cases.map((c) => [
          c.serviceOrder.customer.name,
          c.serviceOrder.customer.phone,
          c.serviceOrder.customer.city,
          c.serviceOrder.saId,
          c.serviceOrder.woNumber ?? "-",
          STATUS_LABELS[c.status],
          c.slaDueAt ? c.slaDueAt.toISOString() : "-",
        ]),
      };
    }

    case "base": {
      const pageSize = opts?.pageSize ?? 50;
      const page = Math.max(1, opts?.page ?? 1);
      const where = { createdAt: { gte: range.from, lte: range.to } };
      const take = opts?.limit ?? pageSize;
      const skip = opts?.limit ? 0 : (page - 1) * pageSize;
      const [totalCount, cases] = await Promise.all([
        prisma.caseRecord.count({ where }),
        prisma.caseRecord.findMany({
          where,
          include: {
            serviceOrder: { include: { customer: true } },
            _count: { select: { statusHistory: true } },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take,
        }),
      ]);
      return {
        title: "Base completa com histórico",
        headers: [
          "SA",
          "WO",
          "Cliente",
          "Telefone",
          "Cidade",
          "Status",
          "Prioridade",
          "Criado em",
          "Atualizado em",
          "Eventos no histórico",
        ],
        rows: cases.map((c) => [
          c.serviceOrder.saId,
          c.serviceOrder.woNumber ?? "-",
          c.serviceOrder.customer.name,
          c.serviceOrder.customer.phone,
          c.serviceOrder.customer.city,
          STATUS_LABELS[c.status],
          c.priority,
          c.createdAt.toISOString(),
          c.updatedAt.toISOString(),
          c._count.statusHistory,
        ]),
        totalCount,
      };
    }
  }
}
