"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CITIES = [
  "Campinas",
  "Sorocaba",
  "Indaiatuba",
  "Franco da Rocha",
  "Votorantim",
  "Cabreúva",
  "Araçariguama",
  "Francisco Morato",
];

type TemplateOption = { id: string; internalName: string };

export function NewCampaignForm({ templates }: { templates: TemplateOption[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [cities, setCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function toggleCity(city: string) {
    setCities((prev) => (prev.includes(city) ? prev.filter((c) => c !== city) : [...prev, city]));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/bot/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, templateId: templateId || null, cities }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao criar campanha");
        return;
      }
      setName("");
      setCities([]);
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg px-3 py-2 text-sm font-medium"
        style={{ background: "var(--brand)", color: "var(--brand-fg)" }}
      >
        Nova campanha
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border p-4 space-y-3"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Nova campanha</span>
        <button type="button" onClick={() => setOpen(false)} className="text-xs" style={{ color: "var(--text-muted)" }}>
          Cancelar
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <label className="text-sm space-y-1">
          <span style={{ color: "var(--text-muted)" }}>Nome</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-lg border px-3 py-2"
            style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
          />
        </label>

        <label className="text-sm space-y-1">
          <span style={{ color: "var(--text-muted)" }}>Template</span>
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="w-full rounded-lg border px-3 py-2"
            style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
          >
            <option value="">(sem template)</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.internalName}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="text-sm space-y-1">
        <span style={{ color: "var(--text-muted)" }}>Cidades</span>
        <div className="flex flex-wrap gap-2">
          {CITIES.map((city) => (
            <label
              key={city}
              className="flex items-center gap-1 rounded-lg border px-2 py-1 text-xs cursor-pointer"
              style={{ borderColor: "var(--border)" }}
            >
              <input type="checkbox" checked={cities.includes(city)} onChange={() => toggleCity(city)} />
              {city}
            </label>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60"
        style={{ background: "var(--brand)", color: "var(--brand-fg)" }}
      >
        {loading ? "Criando..." : "Criar campanha"}
      </button>
      {error && <div style={{ color: "var(--danger)" }}>{error}</div>}
    </form>
  );
}
