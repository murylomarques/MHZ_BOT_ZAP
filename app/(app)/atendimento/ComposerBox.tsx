"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QuickReplySelector } from "./QuickReplySelector";

export function ComposerBox({
  caseId,
  isOwner,
  isClosed,
  ownerName,
}: {
  caseId: string;
  isOwner: boolean;
  isClosed: boolean;
  ownerName?: string;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [assuming, setAssuming] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSend() {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${caseId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao enviar mensagem");
        return;
      }
      setText("");
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  async function handleAssume() {
    setAssuming(true);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${caseId}/assume`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao assumir conversa");
        return;
      }
      router.refresh();
    } finally {
      setAssuming(false);
    }
  }

  async function handleClose() {
    setClosing(true);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${caseId}/close`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao encerrar conversa");
        return;
      }
      router.refresh();
    } finally {
      setClosing(false);
    }
  }

  if (isClosed) {
    return (
      <div className="p-3 border-t text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
        Esta conversa foi encerrada.
      </div>
    );
  }

  return (
    <div className="border-t p-3 space-y-2" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          {isOwner ? "Você está atendendo esta conversa." : ownerName ? `Com ${ownerName}.` : "Ninguém assumiu ainda."}
        </div>
        <div className="flex gap-2">
          {!isOwner && (
            <button
              onClick={handleAssume}
              disabled={assuming}
              className="rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-60"
              style={{ background: "var(--brand)", color: "var(--brand-fg)" }}
            >
              {assuming ? "Assumindo..." : "Assumir"}
            </button>
          )}
          <button
            onClick={handleClose}
            disabled={closing}
            className="rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-60"
            style={{ borderColor: "var(--border)", color: "var(--text)" }}
          >
            {closing ? "Encerrando..." : "Encerrar"}
          </button>
        </div>
      </div>

      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escreva uma mensagem para o cliente..."
          rows={2}
          className="flex-1 rounded-lg border px-3 py-2 text-sm resize-none"
          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
        />
        <QuickReplySelector onInsert={(t) => setText((prev) => (prev ? `${prev}\n${t}` : t))} />
        <button
          onClick={handleSend}
          disabled={sending || !text.trim()}
          className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
          style={{ background: "var(--brand)", color: "var(--brand-fg)" }}
        >
          {sending ? "Enviando..." : "Enviar"}
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
