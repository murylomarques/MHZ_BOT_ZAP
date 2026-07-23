"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Botão manual de "rodar fila de geocodificação" (seção 14 do spec). Dispara
// até 50 endereços pendentes por clique — não é um worker automático.
export function GeocodeRunButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/geocode/run", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setResult(data.error ?? "Erro ao geocodificar.");
      } else {
        setResult(
          `Processados: ${data.processed}, geocodificados: ${data.geocoded}, falharam: ${data.failed}` +
            (data.remaining ? " (ainda há endereços pendentes — clique novamente)" : "")
        );
        router.refresh();
      }
    } catch {
      setResult("Erro de rede ao chamar a fila de geocodificação.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={run}
        disabled={loading}
        className="rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60"
        style={{ background: "var(--brand)", color: "var(--brand-fg)" }}
      >
        {loading ? "Geocodificando..." : "Rodar fila de geocodificação (até 50)"}
      </button>
      {result && (
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>
          {result}
        </span>
      )}
    </div>
  );
}
