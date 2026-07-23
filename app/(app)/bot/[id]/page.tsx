import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/server/db/prisma";
import { getCampaignIndicators } from "@/lib/server/bot/campaign-indicators";
import { CampaignActions } from "./CampaignActions";

export const dynamic = "force-dynamic";

function pct(v: number) {
  return `${Math.round(v * 100)}%`;
}

const INDICATOR_LABELS: { key: keyof Awaited<ReturnType<typeof getCampaignIndicators>>; label: string }[] = [
  { key: "totalSelecionado", label: "Selecionado" },
  { key: "pendente", label: "Pendente" },
  { key: "processando", label: "Processando" },
  { key: "enviado", label: "Enviado" },
  { key: "entregue", label: "Entregue" },
  { key: "lido", label: "Lido" },
  { key: "respondido", label: "Respondido" },
  { key: "erro", label: "Erro" },
];

export default async function BotCampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const campaign = await prisma.botCampaign.findUnique({
    where: { id },
    include: { template: true, createdByUser: { select: { name: true } } },
  });
  if (!campaign) notFound();

  const [indicators, messages] = await Promise.all([
    getCampaignIndicators(id),
    prisma.botMessage.findMany({
      where: { campaignId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { caseRecord: { include: { serviceOrder: { include: { customer: true } } } } },
    }),
  ]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">{campaign.name}</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {campaign.cities.join(", ") || "sem cidades"} · template {campaign.template?.internalName ?? "—"} ·
            criada por {campaign.createdByUser.name}
          </p>
        </div>
        <Link href="/bot" className="text-sm underline" style={{ color: "var(--brand)" }}>
          Voltar
        </Link>
      </div>

      <CampaignActions campaignId={campaign.id} status={campaign.status} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {INDICATOR_LABELS.map(({ key, label }) => (
          <div
            key={key}
            className="rounded-xl border p-4"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <div
              className="text-2xl font-semibold"
              style={{ color: key === "erro" && indicators.erro > 0 ? "var(--danger)" : undefined }}
            >
              {indicators[key]}
            </div>
            <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <div className="text-2xl font-semibold">{pct(indicators.taxaEnvio)}</div>
          <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            Taxa de envio
          </div>
        </div>
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <div className="text-2xl font-semibold">{pct(indicators.taxaResposta)}</div>
          <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            Taxa de resposta
          </div>
        </div>
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <div className="text-2xl font-semibold">{pct(indicators.taxaAgendamento)}</div>
          <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            Taxa de agendamento
          </div>
        </div>
      </div>

      <div>
        <div className="text-sm font-medium mb-2">Logs em tempo real (últimas 50 mensagens)</div>
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b" style={{ borderColor: "var(--border)" }}>
                <th className="p-3">Cliente</th>
                <th className="p-3">Telefone</th>
                <th className="p-3">Status</th>
                <th className="p-3">Erro</th>
                <th className="p-3">Data</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((m) => (
                <tr key={m.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                  <td className="p-3">{m.caseRecord?.serviceOrder.customer.name ?? "—"}</td>
                  <td className="p-3">{m.caseRecord?.serviceOrder.customer.phone ?? "—"}</td>
                  <td className="p-3" style={{ color: m.status === "ERRO" ? "var(--danger)" : undefined }}>
                    {m.status}
                  </td>
                  <td className="p-3" style={{ color: "var(--text-muted)" }}>
                    {m.errorMessage ?? "—"}
                  </td>
                  <td className="p-3" style={{ color: "var(--text-muted)" }}>
                    {m.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                  </td>
                </tr>
              ))}
              {messages.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center" style={{ color: "var(--text-muted)" }}>
                    Nenhuma mensagem disparada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
