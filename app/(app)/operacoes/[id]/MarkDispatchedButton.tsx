"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function MarkDispatchedButton({ caseId }: { caseId: string }) {
  const [open, setOpen] = useState(false);
  const [courierName, setCourierName] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function onConfirm() {
    if (!courierName.trim()) {
      setError("Informe o nome do motoboy");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cases/${caseId}/mark-dispatched`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courierName: courierName.trim(), note: note.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao marcar como enviado");
        return;
      }
      router.refresh();
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg px-3 py-2 text-sm font-medium"
        style={{ background: "var(--brand)", color: "var(--brand-fg)" }}
      >
        Marcar como enviado ao motoboy
      </button>
    );
  }

  return (
    <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <input
        type="text"
        placeholder="Nome do motoboy"
        value={courierName}
        onChange={(e) => setCourierName(e.target.value)}
        className="w-full rounded-lg border px-3 py-2 text-sm"
        style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
      />
      <input
        type="text"
        placeholder="Observação (opcional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="w-full rounded-lg border px-3 py-2 text-sm"
        style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
      />
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          disabled={loading}
          className="rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60"
          style={{ background: "var(--brand)", color: "var(--brand-fg)" }}
        >
          {loading ? "Salvando..." : "Confirmar"}
        </button>
        <button
          onClick={() => setOpen(false)}
          disabled={loading}
          className="rounded-lg px-3 py-2 text-sm"
          style={{ border: "1px solid var(--border)", color: "var(--text)" }}
        >
          Cancelar
        </button>
      </div>
      {error && (
        <div className="text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      )}
    </div>
  );
}
