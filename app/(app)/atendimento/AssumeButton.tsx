"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AssumeButton({
  caseId,
  assignedTo,
  isMine,
}: {
  caseId: string;
  assignedTo?: string;
  isMine: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function assume() {
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

  if (isMine) {
    return (
      <div className="text-xs px-3 py-2 rounded-lg" style={{ background: "var(--success-tint)", color: "var(--success)" }}>
        Você assumiu este caso.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button onClick={assume} disabled={loading} className="mhz-btn-primary w-full rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60">
        {loading ? "Assumindo..." : assignedTo ? `Assumir (com ${assignedTo})` : "Assumir caso"}
      </button>
      {error && (
        <div className="text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      )}
    </div>
  );
}
