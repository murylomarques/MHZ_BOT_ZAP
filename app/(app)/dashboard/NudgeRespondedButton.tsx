"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NudgeRespondedButton({ count }: { count: number }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const router = useRouter();

  async function onClick() {
    if (loading) return;
    if (!window.confirm(`Enviar lembrete para os ${count} clientes que responderam mas não continuaram?`)) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/bot/nudge-responded", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setResult(json?.error ?? "Erro ao enviar lembretes");
      } else {
        setResult(`${json.summary.enviados} enviados, ${json.summary.erros} com erro`);
        router.refresh();
      }
    } catch {
      setResult("Erro de rede ao enviar lembretes");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={onClick}
        disabled={loading || count === 0}
        className="w-full rounded-lg px-2 py-1 text-xs font-medium disabled:opacity-50"
        style={{ background: "var(--brand)", color: "var(--brand-fg)" }}
      >
        {loading ? "Enviando..." : "Enviar lembrete a todos"}
      </button>
      {result && (
        <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          {result}
        </div>
      )}
    </div>
  );
}
