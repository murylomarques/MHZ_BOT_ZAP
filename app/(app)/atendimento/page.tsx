import { prisma } from "@/lib/server/db/prisma";
import { getCurrentSession } from "@/lib/server/auth/session";
import { STATUS_LABELS } from "@/lib/server/status/labels";
import { toAttendantStatus } from "@/lib/server/status/attendant-view";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AttendantActionPanel } from "./AttendantActionPanel";
import { AssumeButton } from "./AssumeButton";

export const dynamic = "force-dynamic";

// Central de Atendimento simplificada: uma única base de casos ainda não
// agendados. O atendente assume, e então agenda ou marca divergente — só
// isso, sem filas/abas para não gerar dúvida sobre o que fazer.
export default async function AtendimentoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const sp = await searchParams;

  const cases = await prisma.caseRecord.findMany({
    where: {
      status: {
        notIn: [
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
          "ENDERECO_DIVERGENTE",
          "ENDERECO_NAO_LOCALIZADO",
          "CONTATO_INVALIDO",
          "CLIENTE_RECUSOU",
          "CANCELADO",
          "CLIENTE_RETIDO",
          "RETIRADA_NAO_REALIZADA",
          "CLIENTE_AUSENTE",
        ],
      },
    },
    include: {
      serviceOrder: { include: { customer: true } },
      assignment: { include: { user: { select: { name: true } } } },
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  const selectedCaseId = sp.caseId ?? cases[0]?.id;

  const selected = selectedCaseId
    ? await prisma.caseRecord.findUnique({
        where: { id: selectedCaseId },
        include: {
          serviceOrder: { include: { customer: { include: { addresses: true } } } },
          assignment: { include: { user: { select: { name: true } } } },
          appointment: true,
          notes: { orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } } } },
        },
      })
    : null;

  function caseHref(id: string) {
    return `/atendimento?caseId=${id}`;
  }

  return (
    <div className="h-[calc(100vh-0px)] flex flex-col">
      <div className="px-6 pt-6">
        <h1 className="text-lg font-semibold">Central de Atendimento</h1>
        <p className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>
          Base de clientes para contato — assuma, agende ou marque divergente. {cases.length} caso(s) na fila.
        </p>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-[300px_1fr_320px] gap-0 px-6 pb-6">
        {/* Coluna 1: base de casos */}
        <div
          className="flex flex-col border rounded-l-xl overflow-hidden"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <div className="flex-1 overflow-y-auto">
            {cases.map((c) => {
              const active = c.id === selectedCaseId;
              const mine = c.assignment?.user && c.assignment.userId === session.sub;
              return (
                <Link
                  key={c.id}
                  href={caseHref(c.id)}
                  className="mhz-table-row block px-3 py-3 border-b text-sm"
                  style={{
                    borderColor: "var(--border)",
                    background: active ? "var(--brand-tint)" : "transparent",
                  }}
                >
                  <div className="font-medium truncate">{c.serviceOrder.customer.name}</div>
                  <div className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                    {c.serviceOrder.customer.phone} · {c.serviceOrder.customer.city}
                  </div>
                  <div
                    className="text-xs truncate mt-0.5"
                    style={{ color: mine ? "var(--brand)" : "var(--text-faint)" }}
                  >
                    {c.assignment?.user.name ? `Com ${c.assignment.user.name}` : "Não atribuído"}
                  </div>
                </Link>
              );
            })}
            {cases.length === 0 && (
              <div className="p-4 text-sm text-center" style={{ color: "var(--text-muted)" }}>
                Nenhum caso pendente de agendamento. Tudo em dia!
              </div>
            )}
          </div>
        </div>

        {/* Coluna 2: dados completos para a ligação */}
        <div
          className="flex flex-col border-t border-b overflow-y-auto p-5"
          style={{ borderColor: "var(--border)", background: "var(--bg)" }}
        >
          {selected ? (
            <div className="space-y-5 max-w-xl">
              <div>
                <div className="text-xl font-semibold">{selected.serviceOrder.customer.name}</div>
                <div className="text-sm" style={{ color: "var(--text-muted)" }}>
                  {STATUS_LABELS[selected.status]}
                </div>
              </div>

              <div className="mhz-card p-4 space-y-2">
                <BigField label="Telefone" value={selected.serviceOrder.customer.phone} highlight />
                <BigField label="Cidade" value={selected.serviceOrder.customer.city} />
                <BigField
                  label="Endereço cadastrado"
                  value={selected.serviceOrder.customer.addresses[0]?.fullAddress ?? "Não informado"}
                />
                <BigField label="SA" value={selected.serviceOrder.saId} />
                <BigField label="WO" value={selected.serviceOrder.woNumber ?? "-"} />
                <BigField
                  label="Data prevista original"
                  value={
                    selected.serviceOrder.woScheduledDate
                      ? selected.serviceOrder.woScheduledDate.toLocaleDateString("pt-BR", {
                          timeZone: "America/Sao_Paulo",
                        })
                      : "-"
                  }
                />
              </div>

              {selected.notes.length > 0 && (
                <div className="mhz-card p-4 space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                    Observações anteriores
                  </div>
                  {selected.notes.map((n) => (
                    <div key={n.id} className="text-sm border-b last:border-0 pb-2" style={{ borderColor: "var(--border)" }}>
                      <div>{n.body}</div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--text-faint)" }}>
                        {n.user?.name ?? "Sistema"} ·{" "}
                        {n.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <AssumeButton caseId={selected.id} assignedTo={selected.assignment?.user.name} isMine={selected.assignment?.userId === session.sub} />

              <Link href={`/operacoes/${selected.id}`} className="text-xs underline block" style={{ color: "var(--brand)" }}>
                Ver histórico completo do caso
              </Link>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm" style={{ color: "var(--text-muted)" }}>
              Selecione um caso na lista ao lado.
            </div>
          )}
        </div>

        {/* Coluna 3: ações */}
        <div
          className="border rounded-r-xl overflow-y-auto p-4"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          {selected ? (
            <AttendantActionPanel
              caseId={selected.id}
              attendantStatus={toAttendantStatus(selected.status)}
              defaultAddress={selected.serviceOrder.customer.addresses[0]?.fullAddress ?? ""}
              defaultCity={selected.serviceOrder.customer.city}
              defaultObservation={selected.appointment?.observation ?? ""}
              isMine={selected.assignment?.userId === session.sub}
            />
          ) : (
            <div className="text-sm" style={{ color: "var(--text-muted)" }}>
              Sem dados para exibir.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BigField({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span
        className={highlight ? "text-base font-semibold" : ""}
        style={{ color: highlight ? "var(--brand)" : "var(--text)" }}
      >
        {value}
      </span>
    </div>
  );
}
