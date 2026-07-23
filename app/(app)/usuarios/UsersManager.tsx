"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Role = "ADMIN" | "GESTOR" | "ATENDENTE";
type Status = "ATIVO" | "BLOQUEADO";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: Status;
  lastLoginAt: string | null;
  createdAt: string;
  cityPermissions: { city: string }[];
};

const ROLES: Role[] = ["ADMIN", "GESTOR", "ATENDENTE"];

const inputStyle = {
  borderColor: "var(--border)",
  background: "var(--surface)",
  color: "var(--text)",
} as const;

export function UsersManager({ users, cities }: { users: UserRow[]; cities: readonly string[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedCities, setExpandedCities] = useState<string | null>(null);

  // Formulário de criação
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("ATENDENTE");

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao criar usuário");
        return;
      }
      setName("");
      setEmail("");
      setPassword("");
      setRole("ATENDENTE");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function patchUser(id: string, body: Record<string, unknown>) {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao atualizar usuário");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  function toggleCity(user: UserRow, city: string) {
    const current = user.cityPermissions.map((c) => c.city);
    const next = current.includes(city) ? current.filter((c) => c !== city) : [...current, city];
    patchUser(user.id, { cities: next });
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={createUser}
        className="rounded-xl border p-4 flex flex-wrap items-end gap-3"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
            Nome
          </label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
            style={inputStyle}
          />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
            E-mail
          </label>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
            style={inputStyle}
          />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
            Senha
          </label>
          <input
            required
            type="password"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
            style={inputStyle}
          />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
            Perfil
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="rounded-lg border px-3 py-2 text-sm"
            style={inputStyle}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60"
          style={{ background: "var(--brand)", color: "var(--brand-fg)" }}
        >
          {loading ? "Salvando..." : "Criar usuário"}
        </button>
        {error && <span style={{ color: "var(--danger)" }}>{error}</span>}
      </form>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="text-left border-b" style={{ borderColor: "var(--border)" }}>
              <th className="p-3">Nome</th>
              <th className="p-3">E-mail</th>
              <th className="p-3">Perfil</th>
              <th className="p-3">Status</th>
              <th className="p-3">Cidades</th>
              <th className="p-3">Último login</th>
              <th className="p-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b last:border-0 align-top" style={{ borderColor: "var(--border)" }}>
                <td className="p-3">{u.name}</td>
                <td className="p-3">{u.email}</td>
                <td className="p-3">
                  <select
                    defaultValue={u.role}
                    disabled={loading}
                    onChange={(e) => patchUser(u.id, { role: e.target.value })}
                    className="rounded-lg border px-2 py-1 text-sm"
                    style={inputStyle}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-3">
                  <button
                    disabled={loading}
                    onClick={() => patchUser(u.id, { status: u.status === "ATIVO" ? "BLOQUEADO" : "ATIVO" })}
                    className="rounded-lg px-2 py-1 text-xs font-medium"
                    style={{
                      background:
                        u.status === "ATIVO"
                          ? "color-mix(in srgb, var(--success) 15%, transparent)"
                          : "color-mix(in srgb, var(--danger) 15%, transparent)",
                      color: u.status === "ATIVO" ? "var(--success)" : "var(--danger)",
                    }}
                  >
                    {u.status}
                  </button>
                </td>
                <td className="p-3">
                  {u.role === "ADMIN" ? (
                    <span style={{ color: "var(--text-muted)" }}>Todas (ADMIN)</span>
                  ) : (
                    <div>
                      <button
                        className="underline text-xs"
                        style={{ color: "var(--brand)" }}
                        onClick={() => setExpandedCities(expandedCities === u.id ? null : u.id)}
                      >
                        {u.cityPermissions.length > 0
                          ? u.cityPermissions.map((c) => c.city).join(", ")
                          : "Nenhuma — clique para definir"}
                      </button>
                      {expandedCities === u.id && (
                        <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
                          {cities.map((city) => {
                            const checked = u.cityPermissions.some((c) => c.city === city);
                            return (
                              <label key={city} className="flex items-center gap-1">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={loading}
                                  onChange={() => toggleCity(u, city)}
                                />
                                {city}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </td>
                <td className="p-3" style={{ color: "var(--text-muted)" }}>
                  {u.lastLoginAt
                    ? new Date(u.lastLoginAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
                    : "Nunca"}
                </td>
                <td className="p-3">
                  <button
                    className="underline text-xs"
                    style={{ color: "var(--brand)" }}
                    onClick={() => {
                      const pwd = prompt(`Nova senha para ${u.name} (mín. 6 caracteres):`);
                      if (pwd && pwd.length >= 6) patchUser(u.id, { password: pwd });
                    }}
                  >
                    Redefinir senha
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center" style={{ color: "var(--text-muted)" }}>
                  Nenhum usuário cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
