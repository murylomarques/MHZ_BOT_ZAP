import { prisma } from "@/lib/server/db/prisma";
import { STATUS_LABELS } from "@/lib/server/status/labels";
import { getDispatchStage, DISPATCH_STAGE_LABELS, type DispatchStage } from "@/lib/server/status/dispatch-stage";
import Link from "next/link";
import type { CaseStatus } from "@prisma/client";

const WAITING_RESPONSE_STATUSES: CaseStatus[] = [
  "MENSAGEM_ENVIADA",
  "MENSAGEM_ENTREGUE",
  "MENSAGEM_LIDA",
  "AGUARDANDO_RESPOSTA",
];

const DISPATCH_FUNNEL_STAGES: DispatchStage[] = [
  "PRIMEIRO_CONTATO",
  "FOLLOWUP_24H",
  "FOLLOWUP_48H",
  "FOLLOWUP_72H",
  "LEAD_PERDIDO",
];

export const dynamic = "force-dynamic";

const CARD_GROUPS: { title: string; statuses: CaseStatus[] }[] = [
  { title: "Pendentes de disparo", statuses: ["IMPORTADO", "PENDENTE_DISPARO"] },
  { title: "Mensagens enviadas", statuses: ["MENSAGEM_ENVIADA", "MENSAGEM_ENTREGUE", "MENSAGEM_LIDA"] },
  { title: "Aguardando resposta", statuses: ["AGUARDANDO_RESPOSTA"] },
  { title: "Respostas recebidas", statuses: ["CLIENTE_RESPONDEU"] },
  { title: "Endereços confirmados", statuses: ["ENDERECO_CONFIRMADO"] },
  { title: "Endereços divergentes", statuses: ["ENDERECO_DIVERGENTE"] },
  { title: "Atendimento humano", statuses: ["ATENDIMENTO_HUMANO", "EM_ATENDIMENTO"] },
  { title: "Aguardando agendamento", statuses: ["AGUARDANDO_AGENDAMENTO"] },
  { title: "Agendados", statuses: ["AGENDADO"] },
  { title: "Aguardando rota", statuses: ["AGUARDANDO_ROTA", "ROTA_PLANEJADA"] },
  { title: "Em retirada", statuses: ["ATRIBUIDO_MOTOBOY", "EM_DESLOCAMENTO"] },
  { title: "Equipamentos retirados", statuses: ["EQUIPAMENTO_RETIRADO"] },
  { title: "Retiradas não realizadas", statuses: ["RETIRADA_NAO_REALIZADA", "CLIENTE_AUSENTE", "ENDERECO_NAO_LOCALIZADO"] },
  { title: "Aguardando baixa", statuses: ["AGUARDANDO_BAIXA", "BAIXA_PROCESSANDO"] },
  { title: "Baixas realizadas", statuses: ["BAIXA_REALIZADA", "FINALIZADO"] },
  { title: "Clientes retidos", statuses: ["CLIENTE_RETIDO"] },
];

export default async function DashboardPage() {
  const total = await prisma.caseRecord.count();

  const byStatus = await prisma.caseRecord.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const statusCount = new Map<CaseStatus, number>(byStatus.map((r) => [r.status, r._count._all]));

  const cityRows = await prisma.$queryRaw<{ city: string; total: bigint }[]>`
    select c.city as city, count(*) as total
    from service_orders so
    join customers c on c.id = so.customer_id
    group by c.city
    order by total desc
  `;

  const waitingCases = await prisma.caseRecord.findMany({
    where: { status: { in: WAITING_RESPONSE_STATUSES } },
    select: { status: true, botMessages: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } } },
  });
  const dispatchFunnelCount = new Map<DispatchStage, number>();
  for (const c of waitingCases) {
    const stage = getDispatchStage(c.status, c.botMessages[0]?.createdAt ?? null);
    dispatchFunnelCount.set(stage, (dispatchFunnelCount.get(stage) ?? 0) + 1);
  }

  const hasData = total > 0;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Visão Geral</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {total.toLocaleString("pt-BR")} casos na base
        </p>
      </div>

      {!hasData && (
        <div
          className="rounded-xl border p-8 text-center text-sm"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)", background: "var(--surface)" }}
        >
          Nenhum caso importado ainda.{" "}
          <Link href="/importacoes" className="underline" style={{ color: "var(--brand)" }}>
            Importar base CSV
          </Link>
        </div>
      )}

      {hasData && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {CARD_GROUPS.map((group) => {
              const value = group.statuses.reduce((acc, s) => acc + (statusCount.get(s) ?? 0), 0);
              const qs = group.statuses.join(",");
              return (
                <Link
                  key={group.title}
                  href={`/operacoes?status=${qs}`}
                  className="rounded-xl border p-4 transition hover:shadow-sm"
                  style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                >
                  <div className="text-2xl font-semibold">{value.toLocaleString("pt-BR")}</div>
                  <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                    {group.title}
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <div className="text-sm font-medium mb-1">Funil de disparo (aguardando resposta)</div>
            <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
              Só acompanhamento por enquanto — o reenvio de follow-up ainda é manual.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {DISPATCH_FUNNEL_STAGES.map((stage) => (
                <Link
                  key={stage}
                  href={`/operacoes?status=${WAITING_RESPONSE_STATUSES.join(",")}`}
                  className="rounded-lg border p-3 transition hover:shadow-sm"
                  style={{ borderColor: "var(--border)", background: "var(--bg)" }}
                >
                  <div className="text-xl font-semibold">{(dispatchFunnelCount.get(stage) ?? 0).toLocaleString("pt-BR")}</div>
                  <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                    {DISPATCH_STAGE_LABELS[stage]}
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <div className="text-sm font-medium mb-3">Registros por cidade</div>
              <div className="space-y-2">
                {cityRows.map((row) => (
                  <div key={row.city} className="flex items-center gap-2 text-sm">
                    <div className="w-32 truncate">{row.city}</div>
                    <div className="flex-1 h-2 rounded-full" style={{ background: "var(--border)" }}>
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: `${Math.min(100, (Number(row.total) / total) * 100 * 3)}%`,
                          background: "var(--brand)",
                        }}
                      />
                    </div>
                    <div className="w-12 text-right" style={{ color: "var(--text-muted)" }}>
                      {Number(row.total)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <div className="text-sm font-medium mb-3">Funil de status (todos)</div>
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {byStatus
                  .sort((a, b) => b._count._all - a._count._all)
                  .map((row) => (
                    <div key={row.status} className="flex items-center justify-between text-sm py-1">
                      <span>{STATUS_LABELS[row.status]}</span>
                      <span style={{ color: "var(--text-muted)" }}>{row._count._all}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
