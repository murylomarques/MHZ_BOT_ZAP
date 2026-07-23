"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ClosureRow = {
  id: string;
  status: string;
  closureCode: string | null;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  customerName: string;
  city: string;
  saId: string;
};

export function ClosuresTable({
  closures,
  showBulkAction,
}: {
  closures: ClosureRow[];
  showBulkAction: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [codeById, setCodeById] = useState<Record<string, string>>({});
  const [observationById, setObservationById] = useState<Record<string, string>>({});
  const [bulkCode, setBulkCode] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === closures.length ? new Set() : new Set(closures.map((c) => c.id))));
  }

  async function darBaixaIndividual(id: string) {
    setLoadingId(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/closures/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          closureCode: codeById[id] || undefined,
          observation: observationById[id] || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error ?? "Falha ao dar baixa", error: true });
        return;
      }
      setMessage({ text: "Baixa processada com sucesso." });
      setOpenRow(null);
      router.refresh();
    } finally {
      setLoadingId(null);
    }
  }

  async function darBaixaEmMassa() {
    if (selected.size === 0) return;
    setBulkLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/closures/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected), closureCode: bulkCode || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error ?? "Falha ao dar baixa em massa", error: true });
        return;
      }
      setMessage({ text: `${data.success} baixa(s) com sucesso, ${data.failed} falha(s).` });
      setSelected(new Set());
      router.refresh();
    } finally {
      setBulkLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {showBulkAction && (
        <div
          className="rounded-xl border p-3 flex flex-wrap items-center gap-2"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>
            {selected.size} selecionado(s)
          </span>
          <input
            placeholder="Código da baixa (opcional, aplicado a todos)"
            value={bulkCode}
            onChange={(e) => setBulkCode(e.target.value)}
            className="rounded-lg border px-2 py-1.5 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
          />
          <button
            type="button"
            disabled={selected.size === 0 || bulkLoading}
            onClick={darBaixaEmMassa}
            className="rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60"
            style={{ background: "var(--brand)", color: "var(--brand-fg)" }}
          >
            {bulkLoading ? "Processando..." : "Dar baixa nos selecionados"}
          </button>
        </div>
      )}

      {message && (
        <div className="text-sm" style={{ color: message.error ? "var(--danger)" : "var(--success)" }}>
          {message.text}
        </div>
      )}

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="text-left border-b" style={{ borderColor: "var(--border)" }}>
              {showBulkAction && (
                <th className="p-3">
                  <input
                    type="checkbox"
                    checked={closures.length > 0 && selected.size === closures.length}
                    onChange={toggleAll}
                  />
                </th>
              )}
              <th className="p-3">Cliente</th>
              <th className="p-3">Cidade</th>
              <th className="p-3">SA</th>
              <th className="p-3">Código da baixa</th>
              <th className="p-3">Tentativas</th>
              <th className="p-3">Último erro</th>
              <th className="p-3">Criado em</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {closures.map((c) => (
              <tr key={c.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                {showBulkAction && (
                  <td className="p-3">
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                  </td>
                )}
                <td className="p-3">{c.customerName}</td>
                <td className="p-3">{c.city}</td>
                <td className="p-3">{c.saId}</td>
                <td className="p-3">{c.closureCode ?? "-"}</td>
                <td className="p-3">{c.attempts}</td>
                <td className="p-3 max-w-[200px] truncate" style={{ color: "var(--danger)" }} title={c.lastError ?? ""}>
                  {c.lastError ?? "-"}
                </td>
                <td className="p-3" style={{ color: "var(--text-muted)" }}>
                  {new Date(c.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                </td>
                <td className="p-3">
                  {openRow === c.id ? (
                    <div className="flex flex-col gap-1 min-w-[220px]">
                      <input
                        placeholder="Código da baixa"
                        value={codeById[c.id] ?? ""}
                        onChange={(e) => setCodeById((prev) => ({ ...prev, [c.id]: e.target.value }))}
                        className="rounded-lg border px-2 py-1 text-xs"
                        style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
                      />
                      <input
                        placeholder="Observação"
                        value={observationById[c.id] ?? ""}
                        onChange={(e) => setObservationById((prev) => ({ ...prev, [c.id]: e.target.value }))}
                        className="rounded-lg border px-2 py-1 text-xs"
                        style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={loadingId === c.id}
                          onClick={() => darBaixaIndividual(c.id)}
                          className="rounded-lg px-2 py-1 text-xs font-medium disabled:opacity-60"
                          style={{ background: "var(--brand)", color: "var(--brand-fg)" }}
                        >
                          {loadingId === c.id ? "Enviando..." : "Confirmar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setOpenRow(null)}
                          className="text-xs underline"
                          style={{ color: "var(--text-muted)" }}
                        >
                          cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setOpenRow(c.id)}
                      className="text-sm underline"
                      style={{ color: "var(--brand)" }}
                    >
                      Dar baixa
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {closures.length === 0 && (
              <tr>
                <td colSpan={showBulkAction ? 9 : 8} className="p-6 text-center" style={{ color: "var(--text-muted)" }}>
                  Nenhuma baixa neste status.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
