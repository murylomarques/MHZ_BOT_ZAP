import { prisma } from "@/lib/server/db/prisma";
import { CapacidadeManager } from "./CapacidadeManager";

export const dynamic = "force-dynamic";

export default async function CapacidadePage() {
  const [rules, blockedDates] = await Promise.all([
    prisma.cityCapacityRule.findMany({
      orderBy: [{ city: "asc" }, { weekday: "asc" }, { windowStart: "asc" }],
    }),
    prisma.blockedDate.findMany({ orderBy: [{ date: "asc" }] }),
  ]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Capacidade e bloqueios de agenda</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Define quantos agendamentos são permitidos por cidade/dia da semana/janela, e datas
          bloqueadas (feriados, paradas operacionais etc.).
        </p>
      </div>

      <CapacidadeManager
        initialRules={rules.map((r) => ({ ...r }))}
        initialBlockedDates={blockedDates.map((b) => ({
          id: b.id,
          city: b.city,
          date: b.date.toISOString().slice(0, 10),
          reason: b.reason,
        }))}
      />
    </div>
  );
}
