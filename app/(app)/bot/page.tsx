import Link from "next/link";
import { prisma } from "@/lib/server/db/prisma";
import { getCampaignIndicators } from "@/lib/server/bot/campaign-indicators";
import { NewCampaignForm } from "./NewCampaignForm";
import type { CampaignStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<CampaignStatus, string> = {
  RASCUNHO: "Rascunho",
  EM_EXECUCAO: "Em execução",
  PAUSADA: "Pausada",
  ENCERRADA: "Encerrada",
};

const STATUS_COLOR: Record<CampaignStatus, string> = {
  RASCUNHO: "var(--text-muted)",
  EM_EXECUCAO: "var(--success)",
  PAUSADA: "var(--brand)",
  ENCERRADA: "var(--danger)",
};

function pct(v: number) {
  return `${Math.round(v * 100)}%`;
}

export default async function BotPage() {
  const [campaigns, templates] = await Promise.all([
    prisma.botCampaign.findMany({
      orderBy: { createdAt: "desc" },
      include: { template: { select: { id: true, internalName: true } } },
    }),
    prisma.botTemplate.findMany({ where: { active: true }, orderBy: { internalName: "asc" } }),
  ]);

  const rows = await Promise.all(
    campaigns.map(async (c) => ({ campaign: c, indicators: await getCampaignIndicators(c.id) }))
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Gestão do Bot</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Campanhas de disparo em massa (HSM/Flow) e seus indicadores.
          </p>
        </div>
        <Link href="/bot/templates" className="text-sm underline" style={{ color: "var(--brand)" }}>
          Gerenciar templates
        </Link>
      </div>

      <NewCampaignForm templates={templates.map((t) => ({ id: t.id, internalName: t.internalName }))} />

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b" style={{ borderColor: "var(--border)" }}>
              <th className="p-3">Campanha</th>
              <th className="p-3">Template</th>
              <th className="p-3">Status</th>
              <th className="p-3">Selecionado</th>
              <th className="p-3">Pendente</th>
              <th className="p-3">Enviado</th>
              <th className="p-3">Entregue</th>
              <th className="p-3">Lido</th>
              <th className="p-3">Respondido</th>
              <th className="p-3">Erro</th>
              <th className="p-3">Taxa envio</th>
              <th className="p-3">Taxa resposta</th>
              <th className="p-3">Taxa agend.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ campaign, indicators }) => (
              <tr key={campaign.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                <td className="p-3">
                  <Link href={`/bot/${campaign.id}`} className="underline" style={{ color: "var(--brand)" }}>
                    {campaign.name}
                  </Link>
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {campaign.cities.join(", ") || "sem cidades"}
                  </div>
                </td>
                <td className="p-3">{campaign.template?.internalName ?? "—"}</td>
                <td className="p-3">
                  <span
                    className="rounded-full px-2 py-1 text-xs font-medium"
                    style={{
                      color: STATUS_COLOR[campaign.status],
                      background: "color-mix(in srgb, currentColor 12%, transparent)",
                    }}
                  >
                    {STATUS_LABEL[campaign.status]}
                  </span>
                </td>
                <td className="p-3">{indicators.totalSelecionado}</td>
                <td className="p-3">{indicators.pendente}</td>
                <td className="p-3">{indicators.enviado}</td>
                <td className="p-3">{indicators.entregue}</td>
                <td className="p-3">{indicators.lido}</td>
                <td className="p-3">{indicators.respondido}</td>
                <td className="p-3" style={{ color: indicators.erro > 0 ? "var(--danger)" : undefined }}>
                  {indicators.erro}
                </td>
                <td className="p-3">{pct(indicators.taxaEnvio)}</td>
                <td className="p-3">{pct(indicators.taxaResposta)}</td>
                <td className="p-3">{pct(indicators.taxaAgendamento)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={13} className="p-6 text-center" style={{ color: "var(--text-muted)" }}>
                  Nenhuma campanha criada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
