"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NotifiedToGroupToggle({ caseId, notified }: { caseId: string; notified: boolean }) {
  const [checked, setChecked] = useState(notified);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onChange(next: boolean) {
    setChecked(next);
    setLoading(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/notified-to-group`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notified: next }),
      });
      if (!res.ok) {
        setChecked(!next); // reverte se falhou
      } else {
        router.refresh();
      }
    } catch {
      setChecked(!next);
    } finally {
      setLoading(false);
    }
  }

  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        disabled={loading}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span style={{ color: checked ? "var(--success)" : "var(--text-muted)" }}>
        {checked ? "Já enviado pro grupo" : "Ainda não enviado pro grupo"}
      </span>
    </label>
  );
}
