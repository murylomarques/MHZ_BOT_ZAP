"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CampaignStatus } from "@prisma/client";

export function CampaignActions({ campaignId, status }: { campaignId: string; status: CampaignStatus }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function run(key: string, fn: () => Promise<Response>) {
    setLoading(key);
    setError(null);
    setMessage(null);
    try {
      const res = await fn();
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha na operação");
        return;
      }
      setMessage(JSON.stringify(data));
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  function statusAction(action: string) {
    return () =>
      run(action, () =>
        fetch(`/api/bot/campaigns/${campaignId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        })
      );
  }

  const btnStyle: React.CSSProperties = {
    borderColor: "var(--border)",
    background: "var(--surface)",
    color: "var(--text)",
  };
  const primaryStyle: React.CSSProperties = { background: "var(--brand)", color: "var(--brand-fg)" };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() =>
            run("populate", () => fetch(`/api/bot/campaigns/${campaignId}/populate`, { method: "POST" }))
          }
          disabled={loading !== null}
          className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-60"
          style={btnStyle}
        >
          {loading === "populate" ? "Adicionando..." : "Adicionar clientes à fila"}
        </button>

        {status === "RASCUNHO" && (
          <button
            onClick={statusAction("iniciar")}
            disabled={loading !== null}
            className="rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60"
            style={primaryStyle}
          >
            {loading === "iniciar" ? "Iniciando..." : "Iniciar campanha"}
          </button>
        )}

        {status === "EM_EXECUCAO" && (
          <>
            <button
              onClick={() =>
                run("disparar", () => fetch(`/api/bot/campaigns/${campaignId}/dispatch`, { method: "POST" }))
              }
              disabled={loading !== null}
              className="rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60"
              style={primaryStyle}
            >
              {loading === "disparar" ? "Disparando..." : "Disparar agora"}
            </button>
            <button
              onClick={statusAction("pausar")}
              disabled={loading !== null}
              className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-60"
              style={btnStyle}
            >
              {loading === "pausar" ? "Pausando..." : "Pausar"}
            </button>
          </>
        )}

        {status === "PAUSADA" && (
          <button
            onClick={statusAction("iniciar")}
            disabled={loading !== null}
            className="rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60"
            style={primaryStyle}
          >
            {loading === "iniciar" ? "Retomando..." : "Retomar"}
          </button>
        )}

        {(status === "EM_EXECUCAO" || status === "PAUSADA" || status === "RASCUNHO") && (
          <button
            onClick={statusAction("encerrar")}
            disabled={loading !== null}
            className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-60"
            style={{ ...btnStyle, color: "var(--danger)" }}
          >
            {loading === "encerrar" ? "Encerrando..." : "Encerrar"}
          </button>
        )}

        <button
          onClick={() =>
            run("reprocessar", () =>
              fetch(`/api/bot/campaigns/${campaignId}/reprocess-errors`, { method: "POST" })
            )
          }
          disabled={loading !== null}
          className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-60"
          style={btnStyle}
        >
          {loading === "reprocessar" ? "Reprocessando..." : "Reprocessar erros"}
        </button>
      </div>

      {message && <div className="text-xs" style={{ color: "var(--success)" }}>{message}</div>}
      {error && <div className="text-xs" style={{ color: "var(--danger)" }}>{error}</div>}
    </div>
  );
}
