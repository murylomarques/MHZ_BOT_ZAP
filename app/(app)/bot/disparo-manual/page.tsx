import Link from "next/link";
import { prisma } from "@/lib/server/db/prisma";
import { STATUS_LABELS } from "@/lib/server/status/labels";
import type { CaseStatus } from "@prisma/client";
import { ManualDispatchForm } from "./ManualDispatchForm";

export const dynamic = "force-dynamic";

// Status em que o caso ainda não teve resposta do cliente — tudo depois de
// CLIENTE_RESPONDEU no fluxo conta como "respondeu" para fins de follow-up.
const NOT_RESPONDED_STATUSES = new Set<CaseStatus>([
  "IMPORTADO",
  "PENDENTE_DISPARO",
  "PROCESSANDO_DISPARO",
  "MENSAGEM_ENVIADA",
  "MENSAGEM_ENTREGUE",
  "MENSAGEM_LIDA",
  "AGUARDANDO_RESPOSTA",
  "CONTATO_INVALIDO",
  "CANCELADO",
]);

const MESSAGE_STATUS_LABELS: Record<string, string> = {
  PENDENTE: "Pendente",
  ENVIADO: "Enviado",
  ENTREGUE: "Entregue",
  LIDO: "Lido",
  ERRO: "Erro",
};

export default async function DisparoManualPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const onlySemResposta = sp.filter === "sem_resposta";

  const cases = await prisma.caseRecord.findMany({
    where: { serviceOrder: { saId: { startsWith: "MANUAL-" } } },
    include: {
      serviceOrder: { include: { customer: true } },
      botMessages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const rows = cases.map((c) => {
    const lastMessage = c.botMessages[0] ?? null;
    const respondeu = !NOT_RESPONDED_STATUSES.has(c.status);
    return {
      id: c.id,
      name: c.serviceOrder.customer.name,
      phone: c.serviceOrder.customer.phone,
      caseStatus: c.status,
      messageStatus: lastMessage?.status ?? "PENDENTE",
      errorMessage: lastMessage?.errorMessage ?? null,
      sentAt: lastMessage?.sentAt ?? null,
      respondeu,
    };
  });

  const summary = {
    total: rows.length,
    entregue: rows.filter((r) => r.messageStatus === "ENTREGUE" || r.messageStatus === "LIDO").length,
    lido: rows.filter((r) => r.messageStatus === "LIDO").length,
    respondeu: rows.filter((r) => r.respondeu).length,
    semResposta: rows.filter((r) => !r.respondeu).length,
    erro: rows.filter((r) => r.messageStatus === "ERRO").length,
  };

  const visibleRows = onlySemResposta ? rows.filter((r) => !r.respondeu) : rows;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Disparo Manual</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Envie a mensagem de contato ativo de retirada para uma lista de números avulsos e acompanhe o follow-up.
        </p>
      </div>

      <ManualDispatchForm />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="mhz-card p-4">
          <div className="text-2xl font-semibold">{summary.total}</div>
          <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Total disparado</div>
        </div>
        <div className="mhz-card p-4">
          <div className="text-2xl font-semibold">{summary.entregue}</div>
          <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Entregue</div>
        </div>
        <div className="mhz-card p-4">
          <div className="text-2xl font-semibold">{summary.lido}</div>
          <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Lido</div>
        </div>
        <div className="mhz-card p-4">
          <div className="text-2xl font-semibold" style={{ color: "var(--success)" }}>{summary.respondeu}</div>
          <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Respondeu</div>
        </div>
        <div className="mhz-card p-4">
          <div className="text-2xl font-semibold" style={{ color: "var(--warning)" }}>{summary.semResposta}</div>
          <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Sem resposta</div>
        </div>
        <div className="mhz-card p-4">
          <div className="text-2xl font-semibold" style={{ color: "var(--danger)" }}>{summary.erro}</div>
          <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Erro</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Link
          href="/bot/disparo-manual"
          className="rounded-lg px-3 py-1.5 text-xs font-medium"
          style={{
            background: onlySemResposta ? "transparent" : "var(--brand-tint)",
            color: onlySemResposta ? "var(--text-muted)" : "var(--brand)",
            border: "1px solid var(--border)",
          }}
        >
          Todos
        </Link>
        <Link
          href="/bot/disparo-manual?filter=sem_resposta"
          className="rounded-lg px-3 py-1.5 text-xs font-medium"
          style={{
            background: onlySemResposta ? "var(--brand-tint)" : "transparent",
            color: onlySemResposta ? "var(--brand)" : "var(--text-muted)",
            border: "1px solid var(--border)",
          }}
        >
          Somente sem resposta (follow-up)
        </Link>
      </div>

      <div className="mhz-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b" style={{ borderColor: "var(--border)" }}>
              <th className="p-3">Nome</th>
              <th className="p-3">Telefone</th>
              <th className="p-3">Status do caso</th>
              <th className="p-3">Status da mensagem</th>
              <th className="p-3">Data do envio</th>
              <th className="p-3">Respondeu</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => (
              <tr key={r.id} className="mhz-table-row border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                <td className="p-3">{r.name}</td>
                <td className="p-3">{r.phone}</td>
                <td className="p-3">{STATUS_LABELS[r.caseStatus]}</td>
                <td className="p-3">
                  <span
                    style={{
                      color:
                        r.messageStatus === "ERRO"
                          ? "var(--danger)"
                          : r.messageStatus === "LIDO"
                            ? "var(--success)"
                            : "var(--text)",
                    }}
                  >
                    {MESSAGE_STATUS_LABELS[r.messageStatus] ?? r.messageStatus}
                  </span>
                  {r.errorMessage && (
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {r.errorMessage}
                    </div>
                  )}
                </td>
                <td className="p-3" style={{ color: "var(--text-muted)" }}>
                  {r.sentAt ? r.sentAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"}
                </td>
                <td className="p-3">
                  <span style={{ color: r.respondeu ? "var(--success)" : "var(--text-muted)" }}>
                    {r.respondeu ? "Sim" : "Não"}
                  </span>
                </td>
              </tr>
            ))}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center" style={{ color: "var(--text-muted)" }}>
                  {onlySemResposta ? "Nenhum caso sem resposta." : "Nenhum disparo manual realizado ainda."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
