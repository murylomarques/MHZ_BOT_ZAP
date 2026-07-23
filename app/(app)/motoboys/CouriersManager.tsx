"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Status = "ATIVO" | "INATIVO";

type Coverage = { city: string; district: string | null };

type Stats = {
  retiradasRealizadas: number;
  retiradasNaoRealizadas: number;
  taxaSucesso: string;
  equipamentosRetirados: number;
};

type CourierRow = {
  id: string;
  name: string;
  phone: string;
  document: string | null;
  status: Status;
  vehicleType: string | null;
  plate: string | null;
  dailyCapacity: number | null;
  observation: string | null;
  coverage: Coverage[];
  stats: Stats;
};

const inputStyle = {
  borderColor: "var(--border)",
  background: "var(--surface)",
  color: "var(--text)",
} as const;

export function CouriersManager({ couriers, cities }: { couriers: CourierRow[]; cities: readonly string[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedCoverage, setExpandedCoverage] = useState<string | null>(null);
  const [newCity, setNewCity] = useState<string>(cities[0] ?? "");
  const [newDistrict, setNewDistrict] = useState("");

  const [form, setForm] = useState({
    name: "",
    phone: "",
    document: "",
    vehicleType: "",
    plate: "",
    dailyCapacity: "",
    observation: "",
  });

  async function createCourier(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/couriers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          document: form.document || undefined,
          vehicleType: form.vehicleType || undefined,
          plate: form.plate || undefined,
          dailyCapacity: form.dailyCapacity ? Number(form.dailyCapacity) : undefined,
          observation: form.observation || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao criar motoboy");
        return;
      }
      setForm({ name: "", phone: "", document: "", vehicleType: "", plate: "", dailyCapacity: "", observation: "" });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function patchCourier(id: string, body: Record<string, unknown>) {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/couriers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao atualizar motoboy");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  function addCoverage(courier: CourierRow) {
    if (!newCity) return;
    const next = [...courier.coverage.map((c) => ({ city: c.city, district: c.district ?? undefined })), { city: newCity, district: newDistrict || undefined }];
    patchCourier(courier.id, { coverage: next });
    setNewDistrict("");
  }

  function removeCoverage(courier: CourierRow, index: number) {
    const next = courier.coverage
      .filter((_, i) => i !== index)
      .map((c) => ({ city: c.city, district: c.district ?? undefined }));
    patchCourier(courier.id, { coverage: next });
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={createCourier}
        className="rounded-xl border p-4 flex flex-wrap items-end gap-3"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
            Nome
          </label>
          <input
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="rounded-lg border px-3 py-2 text-sm"
            style={inputStyle}
          />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
            Telefone
          </label>
          <input
            required
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className="rounded-lg border px-3 py-2 text-sm"
            style={inputStyle}
          />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
            Documento
          </label>
          <input
            value={form.document}
            onChange={(e) => setForm((f) => ({ ...f, document: e.target.value }))}
            className="rounded-lg border px-3 py-2 text-sm"
            style={inputStyle}
          />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
            Veículo
          </label>
          <input
            value={form.vehicleType}
            onChange={(e) => setForm((f) => ({ ...f, vehicleType: e.target.value }))}
            placeholder="moto, carro..."
            className="rounded-lg border px-3 py-2 text-sm"
            style={inputStyle}
          />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
            Placa
          </label>
          <input
            value={form.plate}
            onChange={(e) => setForm((f) => ({ ...f, plate: e.target.value }))}
            className="rounded-lg border px-3 py-2 text-sm"
            style={inputStyle}
          />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
            Capacidade/dia
          </label>
          <input
            type="number"
            min={0}
            value={form.dailyCapacity}
            onChange={(e) => setForm((f) => ({ ...f, dailyCapacity: e.target.value }))}
            className="rounded-lg border px-3 py-2 text-sm w-28"
            style={inputStyle}
          />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
            Observação
          </label>
          <input
            value={form.observation}
            onChange={(e) => setForm((f) => ({ ...f, observation: e.target.value }))}
            className="rounded-lg border px-3 py-2 text-sm"
            style={inputStyle}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60"
          style={{ background: "var(--brand)", color: "var(--brand-fg)" }}
        >
          {loading ? "Salvando..." : "Adicionar motoboy"}
        </button>
        {error && <span style={{ color: "var(--danger)" }}>{error}</span>}
      </form>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="text-left border-b" style={{ borderColor: "var(--border)" }}>
              <th className="p-3">Nome</th>
              <th className="p-3">Telefone</th>
              <th className="p-3">Veículo</th>
              <th className="p-3">Status</th>
              <th className="p-3">Cobertura</th>
              <th className="p-3">Retiradas realizadas</th>
              <th className="p-3">Não realizadas</th>
              <th className="p-3">Taxa de sucesso</th>
              <th className="p-3">Equip. retirados</th>
            </tr>
          </thead>
          <tbody>
            {couriers.map((c) => (
              <tr key={c.id} className="border-b last:border-0 align-top" style={{ borderColor: "var(--border)" }}>
                <td className="p-3">{c.name}</td>
                <td className="p-3">{c.phone}</td>
                <td className="p-3">
                  {c.vehicleType ?? "-"} {c.plate ? `(${c.plate})` : ""}
                </td>
                <td className="p-3">
                  <button
                    disabled={loading}
                    onClick={() => patchCourier(c.id, { status: c.status === "ATIVO" ? "INATIVO" : "ATIVO" })}
                    className="rounded-lg px-2 py-1 text-xs font-medium"
                    style={{
                      background:
                        c.status === "ATIVO"
                          ? "color-mix(in srgb, var(--success) 15%, transparent)"
                          : "color-mix(in srgb, var(--danger) 15%, transparent)",
                      color: c.status === "ATIVO" ? "var(--success)" : "var(--danger)",
                    }}
                  >
                    {c.status}
                  </button>
                </td>
                <td className="p-3">
                  <button
                    className="underline text-xs"
                    style={{ color: "var(--brand)" }}
                    onClick={() => setExpandedCoverage(expandedCoverage === c.id ? null : c.id)}
                  >
                    {c.coverage.length > 0
                      ? c.coverage.map((cv) => (cv.district ? `${cv.city}/${cv.district}` : cv.city)).join(", ")
                      : "Nenhuma — clique para adicionar"}
                  </button>
                  {expandedCoverage === c.id && (
                    <div className="mt-2 space-y-1 text-xs">
                      {c.coverage.map((cv, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span>
                            {cv.city}
                            {cv.district ? ` / ${cv.district}` : ""}
                          </span>
                          <button
                            style={{ color: "var(--danger)" }}
                            onClick={() => removeCoverage(c, i)}
                            disabled={loading}
                          >
                            remover
                          </button>
                        </div>
                      ))}
                      <div className="flex items-center gap-1">
                        <select
                          value={newCity}
                          onChange={(e) => setNewCity(e.target.value)}
                          className="rounded border px-1 py-1"
                          style={inputStyle}
                        >
                          {cities.map((city) => (
                            <option key={city} value={city}>
                              {city}
                            </option>
                          ))}
                        </select>
                        <input
                          placeholder="bairro (opcional)"
                          value={newDistrict}
                          onChange={(e) => setNewDistrict(e.target.value)}
                          className="rounded border px-1 py-1 w-28"
                          style={inputStyle}
                        />
                        <button
                          style={{ color: "var(--brand)" }}
                          onClick={() => addCoverage(c)}
                          disabled={loading}
                        >
                          adicionar
                        </button>
                      </div>
                    </div>
                  )}
                </td>
                <td className="p-3">{c.stats.retiradasRealizadas}</td>
                <td className="p-3">{c.stats.retiradasNaoRealizadas}</td>
                <td className="p-3">{c.stats.taxaSucesso}</td>
                <td className="p-3">{c.stats.equipamentosRetirados}</td>
              </tr>
            ))}
            {couriers.length === 0 && (
              <tr>
                <td colSpan={9} className="p-6 text-center" style={{ color: "var(--text-muted)" }}>
                  Nenhum motoboy cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
