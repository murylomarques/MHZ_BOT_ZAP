"use client";

import { useEffect, useState } from "react";

type QuickReply = { id: string; title: string; body: string };

export function QuickReplySelector({ onInsert }: { onInsert: (text: string) => void }) {
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/quick-replies")
      .then((res) => (res.ok ? res.json() : { quickReplies: [] }))
      .then((data) => {
        if (!cancelled) setQuickReplies(data.quickReplies ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loading && quickReplies.length === 0) return null;

  return (
    <select
      defaultValue=""
      disabled={loading}
      className="rounded-lg border px-2 py-2 text-xs max-w-[180px]"
      style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
      onChange={(e) => {
        const reply = quickReplies.find((q) => q.id === e.target.value);
        if (reply) onInsert(reply.body);
        e.target.value = "";
      }}
    >
      <option value="" disabled>
        {loading ? "Carregando..." : "Resposta rápida..."}
      </option>
      {quickReplies.map((q) => (
        <option key={q.id} value={q.id}>
          {q.title}
        </option>
      ))}
    </select>
  );
}
