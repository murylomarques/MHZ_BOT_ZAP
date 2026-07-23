"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const WEEKDAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

type Rule = {
  id: string;
  city: string;
  weekday: number;
  windowStart: string;
  windowEnd: string;
  maxPerWindow: number;
  maxPerDay: number;
};

type BlockedDate = {
  id: string;
  city: string | null;
  date: string; // YYYY-MM-DD
  reason: string | null;
};

export function CapacidadeManager({
  initialRules,
  initialBlockedDates,
}: {
  initialRules: Rule[];
  initialBlockedDates: BlockedDate[];
}) {
  const router = useRouter();
  const [rules, setRules] = useState(initialRules);
  const [blockedDates, setBlockedDates] = useState(initialBlockedDates);
  const [error, setError] = useState<string | null>(null);

  const [ruleForm, setRuleForm] = useState({
    city: "",
    weekday: "1",
    windowStart: "08:00",
    windowEnd: "12:00",
    maxPerWindow: "10",
    maxPerDay: "30",
  });
  const [blockForm, setBlockForm] = useState({ city: "", date: "", reason: "" });
  const [savingRule, setSavingRule] = useState(false);
  const [savingBlock, setSavingBlock] = useState(false);

  async function submitRule(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSavingRule(true);
    try {
      const res = await fetch("/api/city-capacity-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: ruleForm.city,
          weekday: Number(ruleForm.weekday),
          windowStart: ruleForm.windowStart,
          windowEnd: ruleForm.windowEnd,
          maxPerWindow: Number(ruleForm.maxPerWindow),
          maxPerDay: Number(ruleForm.maxPerDay),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao criar regra");
        return;
      }
      setRules((prev) => [...prev, data.rule].sort((a, b) => a.city.localeCompare(b.city) || a.weekday - b.weekday));
      setRuleForm((f) => ({ ...f, city: "" }));
      router.refresh();
    } finally {
      setSavingRule(false);
    }
  }

  async function deleteRule(id: string) {
    setError(null);
    const res = await fetch(`/api/city-capacity-rules/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Falha ao excluir regra");
      return;
    }
    setRules((prev) => prev.filter((r) => r.id !== id));
    router.refresh();
  }

  async function submitBlock(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSavingBlock(true);
    try {
      const res = await fetch("/api/blocked-dates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: blockForm.city || null,
          date: blockForm.date,
          reason: blockForm.reason || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao criar bloqueio");
        return;
      }
      setBlockedDates((prev) =>
        [
          ...prev,
          { id: data.blockedDate.id, city: data.blockedDate.city, date: blockForm.date, reason: data.blockedDate.reason },
        ].sort((a, b) => a.date.localeCompare(b.date))
      );
      setBlockForm({ city: "", date: "", reason: "" });
      router.refresh();
    } finally {
      setSavingBlock(false);
    }
  }

  async function deleteBlock(id: string) {
    setError(null);
    const res = await fetch(`/api/blocked-dates/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Falha ao excluir bloqueio");
      return;
    }
    setBlockedDates((prev) => prev.filter((b) => b.id !== id));
    router.refresh();
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
          {error}
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Regras de capacidade</h2>

        <form onSubmit={submitRule} className="flex flex-wrap gap-2 items-end rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <label className="text-xs flex flex-col gap-1">
            Cidade
            <input
              required
              value={ruleForm.city}
              onChange={(e) => setRuleForm((f) => ({ ...f, city: e.target.value }))}
              className="rounded-lg border px-2 py-1.5 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
            />
          </label>
          <label className="text-xs flex flex-col gap-1">
            Dia da semana
            <select
              value={ruleForm.weekday}
              onChange={(e) => setRuleForm((f) => ({ ...f, weekday: e.target.value }))}
              className="rounded-lg border px-2 py-1.5 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
            >
              {WEEKDAY_NAMES.map((name, i) => (
                <option key={i} value={i}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs flex flex-col gap-1">
            Janela início
            <input
              type="time"
              value={ruleForm.windowStart}
              onChange={(e) => setRuleForm((f) => ({ ...f, windowStart: e.target.value }))}
              className="rounded-lg border px-2 py-1.5 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
            />
          </label>
          <label className="text-xs flex flex-col gap-1">
            Janela fim
            <input
              type="time"
              value={ruleForm.windowEnd}
              onChange={(e) => setRuleForm((f) => ({ ...f, windowEnd: e.target.value }))}
              className="rounded-lg border px-2 py-1.5 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
            />
          </label>
          <label className="text-xs flex flex-col gap-1">
            Máx. por janela
            <input
              type="number"
              min={1}
              value={ruleForm.maxPerWindow}
              onChange={(e) => setRuleForm((f) => ({ ...f, maxPerWindow: e.target.value }))}
              className="rounded-lg border px-2 py-1.5 text-sm w-24"
              style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
            />
          </label>
          <label className="text-xs flex flex-col gap-1">
            Máx. por dia
            <input
              type="number"
              min={1}
              value={ruleForm.maxPerDay}
              onChange={(e) => setRuleForm((f) => ({ ...f, maxPerDay: e.target.value }))}
              className="rounded-lg border px-2 py-1.5 text-sm w-24"
              style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
            />
          </label>
          <button
            type="submit"
            disabled={savingRule}
            className="rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60"
            style={{ background: "var(--brand)", color: "var(--brand-fg)" }}
          >
            {savingRule ? "Salvando..." : "Adicionar regra"}
          </button>
        </form>

        <div className="rounded-xl border overflow-x-auto" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-left border-b" style={{ borderColor: "var(--border)" }}>
                <th className="p-3">Cidade</th>
                <th className="p-3">Dia</th>
                <th className="p-3">Janela</th>
                <th className="p-3">Máx./janela</th>
                <th className="p-3">Máx./dia</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                  <td className="p-3">{r.city}</td>
                  <td className="p-3">{WEEKDAY_NAMES[r.weekday]}</td>
                  <td className="p-3">
                    {r.windowStart}–{r.windowEnd}
                  </td>
                  <td className="p-3">{r.maxPerWindow}</td>
                  <td className="p-3">{r.maxPerDay}</td>
                  <td className="p-3">
                    <button onClick={() => deleteRule(r.id)} className="underline text-xs" style={{ color: "var(--danger)" }}>
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
              {rules.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center" style={{ color: "var(--text-muted)" }}>
                    Nenhuma regra cadastrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Datas bloqueadas</h2>

        <form onSubmit={submitBlock} className="flex flex-wrap gap-2 items-end rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <label className="text-xs flex flex-col gap-1">
            Cidade (vazio = todas)
            <input
              value={blockForm.city}
              onChange={(e) => setBlockForm((f) => ({ ...f, city: e.target.value }))}
              className="rounded-lg border px-2 py-1.5 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
            />
          </label>
          <label className="text-xs flex flex-col gap-1">
            Data
            <input
              required
              type="date"
              value={blockForm.date}
              onChange={(e) => setBlockForm((f) => ({ ...f, date: e.target.value }))}
              className="rounded-lg border px-2 py-1.5 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
            />
          </label>
          <label className="text-xs flex flex-col gap-1">
            Motivo
            <input
              value={blockForm.reason}
              onChange={(e) => setBlockForm((f) => ({ ...f, reason: e.target.value }))}
              className="rounded-lg border px-2 py-1.5 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
            />
          </label>
          <button
            type="submit"
            disabled={savingBlock}
            className="rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60"
            style={{ background: "var(--brand)", color: "var(--brand-fg)" }}
          >
            {savingBlock ? "Salvando..." : "Bloquear data"}
          </button>
        </form>

        <div className="rounded-xl border overflow-x-auto" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-left border-b" style={{ borderColor: "var(--border)" }}>
                <th className="p-3">Cidade</th>
                <th className="p-3">Data</th>
                <th className="p-3">Motivo</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {blockedDates.map((b) => (
                <tr key={b.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                  <td className="p-3">{b.city ?? "Todas"}</td>
                  <td className="p-3">
                    {new Date(`${b.date}T00:00:00.000Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                  </td>
                  <td className="p-3">{b.reason ?? "-"}</td>
                  <td className="p-3">
                    <button onClick={() => deleteBlock(b.id)} className="underline text-xs" style={{ color: "var(--danger)" }}>
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
              {blockedDates.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center" style={{ color: "var(--text-muted)" }}>
                    Nenhuma data bloqueada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
