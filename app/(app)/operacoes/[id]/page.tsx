import { prisma } from "@/lib/server/db/prisma";
import { STATUS_LABELS } from "@/lib/server/status/labels";
import { getDispatchStage, DISPATCH_STAGE_LABELS } from "@/lib/server/status/dispatch-stage";
import { notFound } from "next/navigation";
import { AssignButton } from "./AssignButton";
import { MarkDispatchedButton } from "./MarkDispatchedButton";
import type { CaseStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const DISPATCHABLE_STATUSES: CaseStatus[] = ["AGENDADO", "AGUARDANDO_ROTA", "ROTA_PLANEJADA"];

export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const caseRecord = await prisma.caseRecord.findUnique({
    where: { id },
    include: {
      serviceOrder: { include: { customer: { include: { addresses: true } }, importBatch: true } },
      assignment: { include: { user: { select: { name: true } } } },
      statusHistory: { orderBy: { createdAt: "desc" } },
      notes: { orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } } } },
      tags: true,
      botMessages: { orderBy: { createdAt: "desc" } },
      appointment: true,
      pickup: { include: { equipment: true, closure: true } },
    },
  });

  if (!caseRecord) notFound();

  const { serviceOrder } = caseRecord;
  const { customer } = serviceOrder;
  const lastDispatchAt = caseRecord.botMessages[0]?.createdAt ?? null;
  const dispatchStage = getDispatchStage(caseRecord.status, lastDispatchAt);

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">{customer.name}</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            SA {serviceOrder.saId} · WO {serviceOrder.woNumber ?? "-"} · {STATUS_LABELS[caseRecord.status]}
          </p>
        </div>
        <div className="flex items-start gap-2">
          {DISPATCHABLE_STATUSES.includes(caseRecord.status) && <MarkDispatchedButton caseId={caseRecord.id} />}
          <AssignButton caseId={caseRecord.id} currentAssignee={caseRecord.assignment?.user.name} />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Section title="Cliente">
          <Field label="Telefone" value={customer.phone} />
          <Field label="Cidade" value={customer.city} />
          <Field label="Endereço original" value={customer.addresses[0]?.fullAddress ?? "-"} />
          <Field label="Telefone duplicado na fila" value={serviceOrder.phoneDuplicateFlag ? "Sim" : "Não"} />
        </Section>

        <Section title="Dados externos">
          <Field label="SA ID" value={serviceOrder.saId} />
          <Field label="Número da SA" value={serviceOrder.saNumber ?? "-"} />
          <Field label="Número da WO" value={serviceOrder.woNumber ?? "-"} />
          <Field
            label="Data programada"
            value={
              serviceOrder.woScheduledDate
                ? serviceOrder.woScheduledDate.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
                : "-"
            }
          />
          <Field label="Lote de importação" value={serviceOrder.importBatch?.fileName ?? "-"} />
        </Section>

        <Section title="Atendimento">
          <Field label="Atendente" value={caseRecord.assignment?.user.name ?? "Não atribuído"} />
          <Field label="Prioridade" value={caseRecord.priority} />
          <Field label="Motivo atendimento humano" value={caseRecord.humanReason ?? "-"} />
        </Section>

        <Section title="Bot">
          <Field label="Etapa de disparo" value={DISPATCH_STAGE_LABELS[dispatchStage]} />
          <Field label="Mensagens registradas" value={String(caseRecord.botMessages.length)} />
          {caseRecord.botMessages.slice(0, 3).map((m) => (
            <div key={m.id} className="text-xs" style={{ color: "var(--text-muted)" }}>
              {m.provider} · {m.status} {m.errorMessage ? `· erro: ${m.errorMessage}` : ""}
            </div>
          ))}
        </Section>

        {caseRecord.appointment && (
          <Section title="Agendamento">
            <Field
              label="Data"
              value={caseRecord.appointment.date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
            />
            <Field label="Janela" value={`${caseRecord.appointment.windowStart} - ${caseRecord.appointment.windowEnd}`} />
            <Field label="Endereço" value={caseRecord.appointment.address} />
          </Section>
        )}

        {caseRecord.pickup && (
          <Section title="Retirada">
            <Field label="Resultado" value={caseRecord.pickup.result ?? "-"} />
            <Field label="Equipamentos" value={String(caseRecord.pickup.equipment.length)} />
            <Field label="Status da baixa" value={caseRecord.pickup.closure?.status ?? "AGUARDANDO"} />
          </Section>
        )}
      </div>

      {caseRecord.notes.length > 0 && (
        <Section title="Notas">
          <div className="space-y-3">
            {caseRecord.notes.map((n) => (
              <div key={n.id} className="text-sm border-b last:border-0 pb-2" style={{ borderColor: "var(--border)" }}>
                <div className="whitespace-pre-line">{n.body}</div>
                <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  {n.user?.name ?? "Sistema"} · {n.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Linha do tempo">
        <div className="space-y-2">
          {caseRecord.statusHistory.map((h) => (
            <div key={h.id} className="text-sm flex items-center gap-2">
              <span style={{ color: "var(--text-muted)" }}>
                {h.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
              </span>
              <span>
                {h.fromStatus ? `${STATUS_LABELS[h.fromStatus]} → ` : ""}
                {STATUS_LABELS[h.toStatus]}
              </span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                ({h.origin})
              </span>
            </div>
          ))}
          {caseRecord.statusHistory.length === 0 && (
            <div className="text-sm" style={{ color: "var(--text-muted)" }}>
              Sem histórico ainda.
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="text-sm font-medium mb-3">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
