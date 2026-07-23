"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type ImportBatch = {
  id: string;
  fileName: string;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  removedCount: number;
  invalidCount: number;
  ignoredCount: number;
  activeBeforeCount: number;
  activeAfterCount: number;
  status: "PROCESSANDO" | "CONCLUIDO" | "ERRO";
  startedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
};

const POLL_INTERVAL_MS = 3000;

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}min ${seconds}s`;
}

export function ImportUploadForm() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const router = useRouter();

  // Relógio local só pra atualizar o "tempo decorrido" a cada segundo entre
  // um poll e outro, sem precisar esperar a rede.
  useEffect(() => {
    if (!batch || batch.status !== "PROCESSANDO") return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [batch]);

  useEffect(() => {
    if (!batch || batch.status !== "PROCESSANDO") return;
    let cancelled = false;
    const poll = setInterval(async () => {
      const res = await fetch(`/api/import/status/${batch.id}`).catch(() => null);
      if (cancelled || !res || !res.ok) return;
      const data = await res.json().catch(() => null);
      if (cancelled || !data?.batch) return;
      setBatch(data.batch);
      if (data.batch.status !== "PROCESSANDO") {
        router.refresh();
      }
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [batch, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    setSubmitting(true);
    setError(null);
    setBatch(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/import", { method: "POST", body: form });

      let data: { error?: string; batchId?: string } | null = null;
      try {
        data = await res.json();
      } catch {
        setError(
          `O servidor não respondeu corretamente (status ${res.status}). A importação pode ter falhado ou ` +
            "demorado demais — confira a lista de importações abaixo antes de tentar de novo."
        );
        return;
      }

      if (!res.ok || !data?.batchId) {
        setError(data?.error ?? `Falha ao importar (status ${res.status})`);
        return;
      }

      setBatch({
        id: data.batchId,
        fileName: file.name,
        totalRows: 0,
        createdCount: 0,
        updatedCount: 0,
        removedCount: 0,
        invalidCount: 0,
        ignoredCount: 0,
        activeBeforeCount: 0,
        activeAfterCount: 0,
        status: "PROCESSANDO",
        startedAt: new Date().toISOString(),
        finishedAt: null,
        errorMessage: null,
      });
      setNow(Date.now());
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? `Erro de rede: ${err.message}` : "Erro de rede ao importar");
    } finally {
      setSubmitting(false);
    }
  }

  const elapsedMs = batch && now ? now - new Date(batch.startedAt).getTime() : 0;
  const processed = batch ? batch.createdCount + batch.updatedCount + batch.invalidCount + batch.ignoredCount : 0;
  const pct = batch && batch.totalRows > 0 ? Math.min(100, Math.round((processed / batch.totalRows) * 100)) : 0;
  const rate = batch && elapsedMs > 1000 ? processed / (elapsedMs / 1000) : 0;
  const remainingRows = batch ? Math.max(0, batch.totalRows - processed) : 0;
  const etaSeconds = rate > 0 ? remainingRows / rate : null;

  return (
    <div
      className="rounded-xl border p-4 space-y-3"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <form onSubmit={onSubmit} className="flex items-center gap-3">
        <input ref={inputRef} type="file" accept=".csv" className="text-sm" disabled={batch?.status === "PROCESSANDO"} />
        <button
          type="submit"
          disabled={submitting || batch?.status === "PROCESSANDO"}
          className="rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60"
          style={{ background: "var(--brand)", color: "var(--brand-fg)" }}
        >
          {submitting ? "Enviando..." : "Importar CSV"}
        </button>
        {error && <span className="text-sm" style={{ color: "var(--danger)" }}>{error}</span>}
      </form>

      {batch?.status === "PROCESSANDO" && (
        <div className="rounded-lg p-3 text-sm space-y-2" style={{ background: "var(--bg)" }}>
          <div className="flex items-center justify-between">
            <span className="font-medium">Importando {batch.fileName}...</span>
            <span style={{ color: "var(--text-muted)" }}>tempo decorrido: {formatDuration(elapsedMs)}</span>
          </div>
          {batch.totalRows > 0 ? (
            <>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                <div
                  className="h-full rounded-full transition-[width]"
                  style={{ width: `${pct}%`, background: "var(--brand)" }}
                />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1" style={{ color: "var(--text-muted)" }}>
                <span>
                  {processed.toLocaleString("pt-BR")} de {batch.totalRows.toLocaleString("pt-BR")} linhas ({pct}%)
                </span>
                <span>
                  {batch.createdCount.toLocaleString("pt-BR")} novos, {batch.updatedCount.toLocaleString("pt-BR")}{" "}
                  atualizados
                </span>
                {etaSeconds !== null && remainingRows > 0 && (
                  <span>estimativa: ~{formatDuration(etaSeconds * 1000)} restantes</span>
                )}
              </div>
            </>
          ) : (
            <div style={{ color: "var(--text-muted)" }}>Lendo o arquivo e preparando o processamento...</div>
          )}
        </div>
      )}

      {batch?.status === "ERRO" && (
        <div className="rounded-lg p-3 text-sm" style={{ background: "var(--bg)", color: "var(--danger)" }}>
          <div className="font-medium">Importação falhou.</div>
          {batch.errorMessage && <div className="mt-1">{batch.errorMessage}</div>}
        </div>
      )}

      {batch?.status === "CONCLUIDO" && (
        <div className="rounded-lg p-3 text-sm" style={{ background: "var(--bg)" }}>
          <div className="font-medium mb-2" style={{ color: "var(--success)" }}>
            Importação concluída em {formatDuration(new Date(batch.finishedAt ?? batch.startedAt).getTime() - new Date(batch.startedAt).getTime())} — volumetria da base:
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
            <span>
              Base antes: <strong>{batch.activeBeforeCount.toLocaleString("pt-BR")}</strong>
            </span>
            <span>→</span>
            <span>
              Base depois: <strong>{batch.activeAfterCount.toLocaleString("pt-BR")}</strong>
            </span>
            <span style={{ color: "var(--text-muted)" }}>
              ({batch.activeAfterCount > batch.activeBeforeCount ? "+" : ""}
              {(batch.activeAfterCount - batch.activeBeforeCount).toLocaleString("pt-BR")})
            </span>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2" style={{ color: "var(--text-muted)" }}>
            <span>
              <strong style={{ color: "var(--text)" }}>{batch.createdCount.toLocaleString("pt-BR")}</strong> novos
            </span>
            <span>
              <strong style={{ color: "var(--text)" }}>{batch.updatedCount.toLocaleString("pt-BR")}</strong>{" "}
              atualizados
            </span>
            <span>
              <strong style={{ color: "var(--text)" }}>{batch.removedCount.toLocaleString("pt-BR")}</strong> removidos
              (não estão mais na base e ainda não tinham sido agendados/retirados)
            </span>
            <span>
              <strong style={{ color: "var(--text)" }}>{batch.invalidCount.toLocaleString("pt-BR")}</strong>{" "}
              inválidos
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
