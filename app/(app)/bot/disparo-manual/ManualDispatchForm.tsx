"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type EntryResult = {
  input: string;
  name: string | null;
  phone: string | null;
  valid: boolean;
  sent: boolean;
  error?: string;
};

type DispatchResponse = {
  summary: { total: number; invalidos: number; enviados: number; erros: number };
  results: EntryResult[];
};

export function ManualDispatchForm() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<DispatchResponse | null>(null);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const entries = textareaRef.current?.value.trim();
    if (!entries) return;
    setLoading(true);
    setError(null);
    setLastResult(null);
    try {
      const res = await fetch("/api/bot/manual-dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao disparar mensagens");
        return;
      }
      setLastResult(data);
      if (textareaRef.current) textareaRef.current.value = "";
      router.refresh();
    } catch {
      setError("Falha de rede ao disparar mensagens");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mhz-card p-4 space-y-3">
      <div>
        <label className="text-sm font-medium" style={{ color: "var(--text)" }}>
          Números para disparo
        </label>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
          Um por linha, no formato <code>nome,telefone</code> ou apenas <code>telefone</code> (com DDI 55 + DDD, ex:
          5519981541198).
        </p>
      </div>
      <textarea
        ref={textareaRef}
        rows={6}
        placeholder={"João Silva,5519981541198\n5511999998888"}
        className="mhz-input w-full p-3 text-sm font-mono"
      />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={loading} className="mhz-btn-primary rounded-lg px-4 py-2 text-sm font-medium">
          {loading ? "Disparando..." : "Disparar"}
        </button>
        {error && <span style={{ color: "var(--danger)" }}>{error}</span>}
        {lastResult && (
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>
            {lastResult.summary.enviados} enviados, {lastResult.summary.erros} com erro,{" "}
            {lastResult.summary.invalidos} inválidos (de {lastResult.summary.total})
          </span>
        )}
      </div>
      {lastResult && lastResult.results.some((r) => !r.valid || (!r.sent && r.valid)) && (
        <div className="text-xs space-y-1 pt-1" style={{ borderTop: "1px solid var(--border)" }}>
          {lastResult.results
            .filter((r) => !r.valid || (!r.sent && r.valid))
            .map((r, i) => (
              <div key={i} style={{ color: "var(--danger)" }}>
                {r.input}: {r.error}
              </div>
            ))}
        </div>
      )}
    </form>
  );
}
