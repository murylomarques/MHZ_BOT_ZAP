"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Template = {
  id: string;
  internalName: string;
  hsmCode: string | null;
  flowCode: string | null;
  previewText: string;
  variables: unknown;
  active: boolean;
  version: number;
};

type FormState = {
  internalName: string;
  hsmCode: string;
  flowCode: string;
  previewText: string;
  variables: string;
  active: boolean;
};

const EMPTY_FORM: FormState = {
  internalName: "",
  hsmCode: "",
  flowCode: "",
  previewText: "",
  variables: "",
  active: true,
};

function variablesToString(v: unknown): string {
  return Array.isArray(v) ? v.join(", ") : "";
}

export function TemplateManager({ templates }: { templates: Template[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function startCreate() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setCreating(true);
    setError(null);
  }

  function startEdit(t: Template) {
    setForm({
      internalName: t.internalName,
      hsmCode: t.hsmCode ?? "",
      flowCode: t.flowCode ?? "",
      previewText: t.previewText,
      variables: variablesToString(t.variables),
      active: t.active,
    });
    setEditingId(t.id);
    setCreating(false);
    setError(null);
  }

  function cancel() {
    setEditingId(null);
    setCreating(false);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const url = editingId ? `/api/bot/templates/${editingId}` : "/api/bot/templates";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao salvar template");
        return;
      }
      setEditingId(null);
      setCreating(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(t: Template) {
    setLoading(true);
    try {
      await fetch(`/api/bot/templates/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !t.active }),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const showForm = creating || editingId !== null;

  return (
    <div className="space-y-4">
      {!showForm && (
        <button
          onClick={startCreate}
          className="rounded-lg px-3 py-2 text-sm font-medium"
          style={{ background: "var(--brand)", color: "var(--brand-fg)" }}
        >
          Novo template
        </button>
      )}

      {showForm && (
        <form
          onSubmit={submit}
          className="rounded-xl border p-4 space-y-3"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{editingId ? "Editar template" : "Novo template"}</span>
            <button type="button" onClick={cancel} className="text-xs" style={{ color: "var(--text-muted)" }}>
              Cancelar
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <label className="text-sm space-y-1">
              <span style={{ color: "var(--text-muted)" }}>Nome interno</span>
              <input
                value={form.internalName}
                onChange={(e) => setForm({ ...form, internalName: e.target.value })}
                required
                className="w-full rounded-lg border px-3 py-2"
                style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
              />
            </label>
            <label className="text-sm space-y-1">
              <span style={{ color: "var(--text-muted)" }}>Nome do template na Meta (ex: msg_inicial_v1)</span>
              <input
                value={form.hsmCode}
                onChange={(e) => setForm({ ...form, hsmCode: e.target.value })}
                placeholder="msg_inicial_v1"
                className="w-full rounded-lg border px-3 py-2"
                style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
              />
              <span className="block text-xs" style={{ color: "var(--text-muted)" }}>
                Precisa ser exatamente o nome do template aprovado no Meta Business Manager — é o que é enviado
                pela Graph API ao disparar a campanha.
              </span>
            </label>
            <label className="text-sm space-y-1">
              <span style={{ color: "var(--text-muted)" }}>Código Flow</span>
              <input
                value={form.flowCode}
                onChange={(e) => setForm({ ...form, flowCode: e.target.value })}
                className="w-full rounded-lg border px-3 py-2"
                style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
              />
            </label>
            <label className="text-sm space-y-1">
              <span style={{ color: "var(--text-muted)" }}>Variáveis (separadas por vírgula)</span>
              <input
                value={form.variables}
                onChange={(e) => setForm({ ...form, variables: e.target.value })}
                placeholder="nome, sa_id"
                className="w-full rounded-lg border px-3 py-2"
                style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
              />
            </label>
          </div>

          <label className="text-sm space-y-1 block">
            <span style={{ color: "var(--text-muted)" }}>Texto de preview</span>
            <textarea
              value={form.previewText}
              onChange={(e) => setForm({ ...form, previewText: e.target.value })}
              required
              rows={3}
              className="w-full rounded-lg border px-3 py-2"
              style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
            />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            <span>Ativo</span>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60"
            style={{ background: "var(--brand)", color: "var(--brand-fg)" }}
          >
            {loading ? "Salvando..." : "Salvar"}
          </button>
          {error && <div style={{ color: "var(--danger)" }}>{error}</div>}
        </form>
      )}

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b" style={{ borderColor: "var(--border)" }}>
              <th className="p-3">Nome</th>
              <th className="p-3">Template na Meta</th>
              <th className="p-3">Flow</th>
              <th className="p-3">Variáveis</th>
              <th className="p-3">Versão</th>
              <th className="p-3">Ativo</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                <td className="p-3">{t.internalName}</td>
                <td className="p-3">{t.hsmCode ?? "—"}</td>
                <td className="p-3">{t.flowCode ?? "—"}</td>
                <td className="p-3" style={{ color: "var(--text-muted)" }}>
                  {variablesToString(t.variables) || "—"}
                </td>
                <td className="p-3">v{t.version}</td>
                <td className="p-3">
                  <button
                    onClick={() => toggleActive(t)}
                    disabled={loading}
                    className="rounded-full px-2 py-1 text-xs font-medium"
                    style={{
                      color: t.active ? "var(--success)" : "var(--text-muted)",
                      background: "color-mix(in srgb, currentColor 12%, transparent)",
                    }}
                  >
                    {t.active ? "Ativo" : "Inativo"}
                  </button>
                </td>
                <td className="p-3 text-right">
                  <button onClick={() => startEdit(t)} className="underline text-xs" style={{ color: "var(--brand)" }}>
                    Editar
                  </button>
                </td>
              </tr>
            ))}
            {templates.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center" style={{ color: "var(--text-muted)" }}>
                  Nenhum template cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
