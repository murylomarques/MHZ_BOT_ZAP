"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AssignButton({ caseId, currentAssignee }: { caseId: string; currentAssignee?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function onAssign() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cases/${caseId}/assign`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao assumir");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="text-right">
      <button
        onClick={onAssign}
        disabled={loading}
        className="rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60"
        style={{ background: "var(--brand)", color: "var(--brand-fg)" }}
      >
        {loading ? "Assumindo..." : "Assumir caso"}
      </button>
      {currentAssignee && (
        <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          Atualmente com {currentAssignee}
        </div>
      )}
      {error && (
        <div className="text-xs mt-1" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      )}
    </div>
  );
}
