"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DIVERGENCE_REASONS } from "@/lib/server/status/divergence-reasons";
import type { AttendantStatus } from "@/lib/server/status/attendant-view";

const CITIES = [
  "Campinas",
  "Sorocaba",
  "Indaiatuba",
  "Franco da Rocha",
  "Votorantim",
  "Cabreuva",
  "Aracariguama",
  "Francisco Morato",
];

export function AttendantActionPanel({
  caseId,
  attendantStatus,
  defaultAddress,
  defaultCity,
  defaultObservation,
  isMine,
}: {
  caseId: string;
  attendantStatus: AttendantStatus;
  defaultAddress: string;
  defaultCity: string;
  defaultObservation: string;
  isMine: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"none" | "agendar" | "divergente">("none");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [date, setDate] = useState("");
  const [windowStart, setWindowStart] = useState("08:00");
  const [windowEnd, setWindowEnd] = useState("12:00");
  const [address, setAddress] = useState(defaultAddress);
  const [city, setCity] = useState(defaultCity || CITIES[0]);
  const [observation, setObservation] = useState(defaultObservation);

  const [reasonCode, setReasonCode] = useState(DIVERGENCE_REASONS[0].code);
  const [note, setNote] = useState("");

  async function submitAgendar(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/cases/${caseId}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, windowStart, windowEnd, address, city, observation }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao agendar");
        return;
      }
      setInfo(data.message);
      setMode("none");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function submitDivergente(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cases/${caseId}/divergent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reasonCode, note }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao marcar divergente");
        return;
      }
      setMode("none");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const pillStyle: Record<AttendantStatus, { bg: string; fg: string }> = {
    NAO_AGENDADO: { bg: "var(--warning-tint)", fg: "var(--warning)" },
    AGENDADO: { bg: "var(--success-tint)", fg: "var(--success)" },
    DIVERGENTE: { bg: "var(--danger-tint)", fg: "var(--danger)" },
  };
  const pillLabel: Record<AttendantStatus, string> = {
    NAO_AGENDADO: "Não agendado",
    AGENDADO: "Agendado",
    DIVERGENTE: "Divergente",
  };

  return (
    <div className="mhz-card p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span
          className="text-xs font-semibold px-2 py-1 rounded-full"
          style={{ background: pillStyle[attendantStatus].bg, color: pillStyle[attendantStatus].fg }}
        >
          {pillLabel[attendantStatus]}
        </span>
      </div>

      {!isMine && (
        <div className="text-xs px-2 py-2 rounded-lg" style={{ background: "var(--warning-tint)", color: "var(--warning)" }}>
          Assuma o caso ao lado para poder agendar ou marcar divergente.
        </div>
      )}

      {isMine && mode === "none" && (
        <div className="flex gap-2">
          <button
            onClick={() => setMode("agendar")}
            className="mhz-btn-primary flex-1 rounded-lg px-3 py-2 text-xs font-medium"
          >
            Agendar retirada
          </button>
          <button
            onClick={() => setMode("divergente")}
            className="flex-1 rounded-lg px-3 py-2 text-xs font-medium"
            style={{ background: "var(--danger-tint)", color: "var(--danger)" }}
          >
            Marcar divergente
          </button>
        </div>
      )}

      {mode === "agendar" && (
        <form onSubmit={submitAgendar} className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mhz-input col-span-3 px-2 py-1.5 text-xs"
            />
            <input
              type="time"
              value={windowStart}
              onChange={(e) => setWindowStart(e.target.value)}
              className="mhz-input px-2 py-1.5 text-xs col-span-1"
            />
            <span className="text-xs self-center text-center" style={{ color: "var(--text-muted)" }}>
              até
            </span>
            <input
              type="time"
              value={windowEnd}
              onChange={(e) => setWindowEnd(e.target.value)}
              className="mhz-input px-2 py-1.5 text-xs col-span-1"
            />
          </div>
          <select value={city} onChange={(e) => setCity(e.target.value)} className="mhz-input w-full px-2 py-1.5 text-xs">
            {CITIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <textarea
            required
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Endereço completo (edite se o cliente corrigir)"
            rows={2}
            className="mhz-input w-full px-2 py-1.5 text-xs resize-none"
          />
          <textarea
            value={observation}
            onChange={(e) => setObservation(e.target.value)}
            placeholder="Observação do agendamento (opcional)"
            rows={2}
            className="mhz-input w-full px-2 py-1.5 text-xs resize-none"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="mhz-btn-primary flex-1 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-60"
            >
              {loading ? "Salvando..." : "Confirmar agendamento"}
            </button>
            <button type="button" onClick={() => setMode("none")} className="mhz-btn-ghost rounded-lg px-3 py-1.5 text-xs">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {mode === "divergente" && (
        <form onSubmit={submitDivergente} className="space-y-2">
          <select
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
            className="mhz-input w-full px-2 py-1.5 text-xs"
          >
            {DIVERGENCE_REASONS.map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}
              </option>
            ))}
          </select>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Observação (opcional)"
            rows={2}
            className="mhz-input w-full px-2 py-1.5 text-xs resize-none"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-60"
              style={{ background: "var(--danger)", color: "#fff" }}
            >
              {loading ? "Salvando..." : "Confirmar divergente"}
            </button>
            <button type="button" onClick={() => setMode("none")} className="mhz-btn-ghost rounded-lg px-3 py-1.5 text-xs">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {info && (
        <div className="text-xs" style={{ color: "var(--success)" }}>
          {info}
        </div>
      )}
      {error && (
        <div className="text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      )}
    </div>
  );
}
