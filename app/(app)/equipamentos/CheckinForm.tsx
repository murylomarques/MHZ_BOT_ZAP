"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function CheckinForm() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = inputRef.current?.value.trim();
    if (!code || loading) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/equipment/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage({ kind: "error", text: json.error ?? "Erro ao bipar" });
      } else {
        const eq = json.equipment;
        setMessage({
          kind: "ok",
          text: `✅ ${eq.saId} — ${eq.type}${eq.macAddress ? ` (${eq.macAddress})` : ""} — motoboy: ${eq.courierName}${
            json.closureReleased ? " — baixa liberada! 🎉" : ""
          }`,
        });
        router.refresh();
      }
    } catch {
      setMessage({ kind: "error", text: "Erro de rede ao bipar" });
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
      inputRef.current?.focus();
    }
  }

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="text-sm font-medium mb-1">Bipar equipamento</div>
      <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
        Digita ou escaneia o MAC do equipamento ou o número da SA, e aperta Enter.
      </p>
      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          autoFocus
          disabled={loading}
          placeholder="MAC ou SA..."
          className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
          style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
          style={{ background: "var(--brand)", color: "var(--brand-fg)" }}
        >
          {loading ? "Bipando..." : "Bipar"}
        </button>
      </form>
      {message && (
        <div
          className="text-sm mt-3 rounded-lg px-3 py-2"
          style={{
            background: message.kind === "ok" ? "color-mix(in srgb, var(--success, #2e8b57) 12%, transparent)" : "color-mix(in srgb, var(--danger) 12%, transparent)",
            color: message.kind === "ok" ? "var(--success, #2e8b57)" : "var(--danger)",
          }}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
