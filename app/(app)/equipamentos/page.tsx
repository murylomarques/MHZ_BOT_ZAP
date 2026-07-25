import { requireUser, roleHasPermission } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";
import Link from "next/link";
import { CheckinForm } from "./CheckinForm";

export const dynamic = "force-dynamic";

export default async function EquipamentosPage() {
  const session = await requireUser();
  if (!roleHasPermission(session.role, "closures_manage")) {
    return (
      <div className="p-6" style={{ color: "var(--text-muted)" }}>
        Acesso negado. Esta página é restrita a ADMIN e GESTOR.
      </div>
    );
  }

  const [byCourier, pendingItems] = await Promise.all([
    prisma.$queryRaw<{ courier_id: string | null; courier_name: string | null; count: bigint }[]>`
      SELECT p.courier_id, co.name AS courier_name, count(*) AS count
      FROM pickup_equipment pe
      JOIN pickups p ON p.id = pe.pickup_id
      LEFT JOIN couriers co ON co.id = p.courier_id
      WHERE pe.returned_to_base_at IS NULL
      GROUP BY p.courier_id, co.name
      ORDER BY count DESC
    `,
    prisma.pickupEquipment.findMany({
      where: { returnedToBaseAt: null },
      include: { pickup: { include: { courier: true, caseRecord: { include: { serviceOrder: true } } } } },
      orderBy: { id: "desc" },
      take: 100,
    }),
  ]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Custódia de equipamentos</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Equipamento retirado só libera baixa depois de devolvido/conferido na base.
          </p>
        </div>
        <Link href="/baixas" className="text-sm underline" style={{ color: "var(--brand)" }}>
          Ver baixas
        </Link>
      </div>

      <CheckinForm />

      <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <div className="text-sm font-medium mb-3">Com o técnico agora (pendente de devolução)</div>
        <div className="space-y-2">
          {byCourier.map((row) => (
            <div key={row.courier_id ?? "sem-motoboy"} className="flex items-center justify-between text-sm">
              <span>{row.courier_name ?? "Sem motoboy vinculado"}</span>
              <span style={{ color: "var(--text-muted)" }}>{Number(row.count)} equipamento(s)</span>
            </div>
          ))}
          {byCourier.length === 0 && (
            <div className="text-sm" style={{ color: "var(--text-muted)" }}>
              Nenhum equipamento pendente de devolução no momento.
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="text-left border-b" style={{ borderColor: "var(--border)" }}>
              <th className="p-3">SA</th>
              <th className="p-3">Tipo</th>
              <th className="p-3">MAC</th>
              <th className="p-3">Motoboy</th>
            </tr>
          </thead>
          <tbody>
            {pendingItems.map((eq) => (
              <tr key={eq.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                <td className="p-3">
                  <Link href={`/operacoes/${eq.pickup.caseId}`} className="underline" style={{ color: "var(--brand)" }}>
                    {eq.pickup.caseRecord.serviceOrder.saId}
                  </Link>
                </td>
                <td className="p-3">{eq.type}</td>
                <td className="p-3">{eq.macAddress ?? "-"}</td>
                <td className="p-3">{eq.pickup.courier?.name ?? "-"}</td>
              </tr>
            ))}
            {pendingItems.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center" style={{ color: "var(--text-muted)" }}>
                  Nenhum equipamento pendente.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
