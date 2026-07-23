import { prisma } from "@/lib/server/db/prisma";
import { STATUS_LABELS } from "@/lib/server/status/labels";
import { notFound } from "next/navigation";
import { PickupForm } from "./PickupForm";

export const dynamic = "force-dynamic";

export default async function RetiradaDetailPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;

  const caseRecord = await prisma.caseRecord.findUnique({
    where: { id: caseId },
    include: {
      serviceOrder: { include: { customer: { include: { addresses: true } } } },
      pickup: { include: { equipment: true, attempts: true, proofs: true, courier: true } },
    },
  });

  if (!caseRecord) notFound();

  const couriers = await prisma.courier.findMany({
    where: { status: "ATIVO" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const { serviceOrder } = caseRecord;
  const { customer } = serviceOrder;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-lg font-semibold">{customer.name}</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          SA {serviceOrder.saId} · {customer.city} · {STATUS_LABELS[caseRecord.status]}
        </p>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          Endereço: {customer.addresses[0]?.fullAddress ?? "Não disponível na base importada"}
        </p>
      </div>

      <PickupForm
        caseId={caseRecord.id}
        currentStatus={caseRecord.status}
        couriers={couriers}
        pickup={
          caseRecord.pickup
            ? {
                courierId: caseRecord.pickup.courierId,
                observation: caseRecord.pickup.observation,
                result: caseRecord.pickup.result,
                equipment: caseRecord.pickup.equipment.map((e) => ({
                  type: e.type as
                    | "ONU"
                    | "ROTEADOR"
                    | "MODEM"
                    | "FONTE"
                    | "CONTROLE"
                    | "REPETIDOR"
                    | "CABO"
                    | "OUTROS",
                  brand: e.brand ?? "",
                  model: e.model ?? "",
                  serialNumber: e.serialNumber ?? "",
                  macAddress: e.macAddress ?? "",
                  assetTag: e.assetTag ?? "",
                  quantity: e.quantity,
                  condition: e.condition ?? "",
                  observation: e.observation ?? "",
                })),
              }
            : null
        }
      />
    </div>
  );
}
