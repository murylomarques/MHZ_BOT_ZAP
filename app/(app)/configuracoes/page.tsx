import Link from "next/link";

export const dynamic = "force-dynamic";

const CARDS = [
  {
    href: "/configuracoes/capacidade",
    title: "Capacidade e bloqueios de agenda",
    description: "Regras de capacidade por cidade/dia da semana/janela e bloqueio de datas (feriados, etc.).",
  },
];

export default function ConfiguracoesPage() {
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Configurações</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Parâmetros gerais do sistema.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-xl border p-4 hover:opacity-90"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <div className="font-medium">{c.title}</div>
            <div className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              {c.description}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
