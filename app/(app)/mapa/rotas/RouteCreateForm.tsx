"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type EligibleCase = {
  id: string;
  customerName: string;
  city: string;
  saId: string;
};

export type CourierOption = { id: string; name: string; vehicleType: string | null };

export function RouteCreateForm({
  eligibleCases,
  couriers,
}: {
  eligibleCases: EligibleCase[];
  couriers: CourierOption[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [courierId, setCourierId] = useState(couriers[0]?.id ?? "");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (selected.size === 0 || !courierId) {
      setMessage("Selecione ao menos um caso e um motoboy.");
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courierId, date, caseIds: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Erro ao criar rota.");
      } else {
        const ignoredCount = data.casosIgnorados?.length ?? 0;
        setMessage(
          `Rota criada com ${data.route.stops.length} parada(s).` +
            (ignoredCount ? ` ${ignoredCount} caso(s) ignorado(s) — ver detalhes na rota.` : "")
        );
        setSelected(new Set());
        router.refresh();
      }
    } catch {
      setMessage("Erro de rede ao criar rota.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <h2 className="text-sm font-semibold">Criar rota</h2>

      <div className="flex flex-wrap gap-2">
        <select
          value={courierId}
          onChange={(e) => setCourierId(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
        >
          <option value="">Selecione o motoboy</option>
          {couriers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.vehicleType ? ` (${c.vehicleType})` : ""}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
        />
        <button
          onClick={submit}
          disabled={loading}
          className="rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60"
          style={{ background: "var(--brand)", color: "var(--brand-fg)" }}
        >
          {loading ? "Criando..." : `Criar rota (${selected.size} caso(s))`}
        </button>
      </div>

      {message && <p className="text-sm" style={{ color: "var(--text-muted)" }}>{message}</p>}

      <div className="max-h-72 overflow-y-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b" style={{ borderColor: "var(--border)" }}>
              <th className="p-2 w-10"></th>
              <th className="p-2">Cliente</th>
              <th className="p-2">Cidade</th>
              <th className="p-2">SA</th>
            </tr>
          </thead>
          <tbody>
            {eligibleCases.map((c) => (
              <tr key={c.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                <td className="p-2">
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                </td>
                <td className="p-2">{c.customerName}</td>
                <td className="p-2">{c.city}</td>
                <td className="p-2">{c.saId}</td>
              </tr>
            ))}
            {eligibleCases.length === 0 && (
              <tr>
                <td colSpan={4} className="p-4 text-center" style={{ color: "var(--text-muted)" }}>
                  Nenhum caso aguardando rota com endereço geocodificado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
