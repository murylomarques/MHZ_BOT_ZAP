"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  IconGrid,
  IconList,
  IconChat,
  IconBot,
  IconCalendar,
  IconMap,
  IconBox,
  IconCheckCircle,
  IconChart,
  IconUpload,
  IconMotorbike,
  IconUsers,
  IconGear,
  IconShield,
  IconTask,
  IconTrophy,
  IconSearch,
  IconSend,
} from "./icons";
import { ThemeToggle } from "./ThemeToggle";

type NavItem = { href: string; label: string; icon: (props: { className?: string }) => React.ReactNode };
type NavGroup = { title: string; items: NavItem[] };

const NAV_ADMIN_GESTOR: NavGroup[] = [
  {
    title: "Principal",
    items: [
      { href: "/dashboard", label: "Visão Geral", icon: IconGrid },
      { href: "/operacoes", label: "Central de Operações", icon: IconList },
      { href: "/atendimento", label: "Atendimento", icon: IconChat },
    ],
  },
  {
    title: "Operação",
    items: [
      { href: "/bot", label: "Gestão do Bot", icon: IconBot },
      { href: "/bot/disparo-manual", label: "Disparo Manual", icon: IconSend },
      { href: "/agenda", label: "Agenda", icon: IconCalendar },
      { href: "/mapa", label: "Mapa e Rotas", icon: IconMap },
      { href: "/retiradas", label: "Retiradas", icon: IconBox },
      { href: "/baixas", label: "Baixas", icon: IconCheckCircle },
    ],
  },
  {
    title: "Gestão",
    items: [
      { href: "/relatorios", label: "Relatórios", icon: IconChart },
      { href: "/importacoes", label: "Importações", icon: IconUpload },
      { href: "/motoboys", label: "Motoboys", icon: IconMotorbike },
    ],
  },
  {
    title: "Sistema",
    items: [
      { href: "/usuarios", label: "Usuários", icon: IconUsers },
      { href: "/configuracoes", label: "Configurações", icon: IconGear },
      { href: "/auditoria", label: "Auditoria", icon: IconShield },
    ],
  },
];

const NAV_ATENDENTE: NavGroup[] = [
  {
    title: "Meu trabalho",
    items: [
      { href: "/dashboard", label: "Minha Fila", icon: IconGrid },
      { href: "/atendimento", label: "Conversas", icon: IconChat },
      { href: "/agenda", label: "Agenda", icon: IconCalendar },
      { href: "/operacoes", label: "Clientes e Retiradas", icon: IconList },
      { href: "/minhas-tarefas", label: "Minhas Tarefas", icon: IconTask },
      { href: "/minhas-metricas", label: "Minhas Métricas", icon: IconTrophy },
    ],
  },
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function AppShell({
  role,
  userName,
  children,
}: {
  role: "ADMIN" | "GESTOR" | "ATENDENTE";
  userName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const groups = role === "ATENDENTE" ? NAV_ATENDENTE : NAV_ADMIN_GESTOR;

  const currentLabel =
    groups.flatMap((g) => g.items).find((item) => pathname === item.href || pathname.startsWith(item.href + "/"))
      ?.label ?? "MHZ Retira";

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function onSearchSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get("q");
    if (q) router.push(`/operacoes?q=${encodeURIComponent(String(q))}`);
  }

  return (
    <div className="h-screen flex overflow-hidden" style={{ background: "var(--bg)" }}>
      <aside
        className="flex flex-col shrink-0 transition-[width] duration-200"
        style={{
          width: collapsed ? 68 : 252,
          background: "var(--sidebar)",
          borderRight: "1px solid var(--border)",
        }}
      >
        <div className="flex items-center gap-2.5 px-4 h-16 shrink-0">
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 font-bold text-sm"
            style={{ background: "var(--brand)", color: "var(--brand-fg)" }}
          >
            M
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="font-semibold text-sm leading-tight truncate" style={{ color: "var(--text)" }}>
                MHZ Retira
              </div>
              <div className="text-[11px] leading-tight truncate" style={{ color: "var(--text-muted)" }}>
                Central de Retiradas
              </div>
            </div>
          )}
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto px-2 pb-3 space-y-4">
          {groups.map((group) => (
            <div key={group.title}>
              {!collapsed && (
                <div
                  className="px-2.5 mb-1 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-faint)" }}
                >
                  {group.title}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + "/");
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      data-active={active}
                      className="mhz-nav-item flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] transition-colors relative"
                      style={{
                        color: active ? "var(--brand)" : "var(--text-soft)",
                        background: active ? "var(--brand-tint)" : "transparent",
                        fontWeight: active ? 600 : 500,
                      }}
                      title={item.label}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-2 shrink-0" style={{ borderTop: "1px solid var(--border)" }}>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="mhz-btn-ghost w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px]"
          >
            <span className="h-[18px] w-[18px] flex items-center justify-center shrink-0">{collapsed ? "»" : "«"}</span>
            {!collapsed && <span>Recolher menu</span>}
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        <header
          className="h-16 shrink-0 flex items-center gap-4 px-6"
          style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}
        >
          <h1 className="text-[15px] font-semibold shrink-0" style={{ color: "var(--text)" }}>
            {currentLabel}
          </h1>

          <form onSubmit={onSearchSubmit} className="flex-1 max-w-md">
            <div className="mhz-input flex items-center gap-2 h-9 px-3">
              <IconSearch className="h-4 w-4 shrink-0" style={{ color: "var(--text-faint)" }} />
              <input
                name="q"
                type="search"
                placeholder="Buscar cliente, telefone, SA, WO..."
                className="flex-1 bg-transparent outline-none text-sm"
                style={{ color: "var(--text)" }}
              />
            </div>
          </form>

          <div className="ml-auto flex items-center gap-3 shrink-0">
            <ThemeToggle />
            <div className="h-6 w-px" style={{ background: "var(--border)" }} />
            <div className="flex items-center gap-2.5">
              <div
                className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                style={{ background: "var(--brand-tint)", color: "var(--brand)" }}
              >
                {initials(userName)}
              </div>
              <div className="hidden sm:block leading-tight">
                <div className="text-[13px] font-medium truncate max-w-[140px]" style={{ color: "var(--text)" }}>
                  {userName}
                </div>
                <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {role}
                </div>
              </div>
              <button onClick={logout} className="mhz-btn-ghost text-[13px] px-2.5 py-1.5 rounded-lg">
                Sair
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 min-w-0 min-h-0 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
