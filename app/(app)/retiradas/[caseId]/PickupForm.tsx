"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const EQUIPMENT_TYPES = ["ONU", "ROTEADOR", "MODEM", "FONTE", "CONTROLE", "REPETIDOR", "CABO", "OUTROS"] as const;

const ATTEMPT_REASONS: { value: string; label: string }[] = [
  { value: "cliente_ausente", label: "Cliente ausente" },
  { value: "endereco_incorreto", label: "Endereço incorreto" },
  { value: "cliente_mudou", label: "Cliente mudou de endereço" },
  { value: "cliente_recusou", label: "Cliente recusou" },
  { value: "equipamento_nao_localizado", label: "Equipamento não localizado" },
  { value: "regiao_de_risco", label: "Região de risco" },
  { value: "problema_veiculo", label: "Problema no veículo" },
  { value: "cancelada", label: "Cancelada" },
  { value: "outros", label: "Outros" },
];

type EquipmentRow = {
  type: (typeof EQUIPMENT_TYPES)[number];
  brand: string;
  model: string;
  serialNumber: string;
  macAddress: string;
  assetTag: string;
  quantity: number;
  condition: string;
  observation: string;
};

const emptyEquipment = (): EquipmentRow => ({
  type: "ONU",
  brand: "",
  model: "",
  serialNumber: "",
  macAddress: "",
  assetTag: "",
  quantity: 1,
  condition: "",
  observation: "",
});

export function PickupForm({
  caseId,
  currentStatus,
  couriers,
  pickup,
}: {
  caseId: string;
  currentStatus: string;
  couriers: { id: string; name: string }[];
  pickup: {
    courierId: string | null;
    observation: string | null;
    result: string | null;
    equipment: EquipmentRow[];
  } | null;
}) {
  const router = useRouter();
  const [courierId, setCourierId] = useState(pickup?.courierId ?? "");
  const [observation, setObservation] = useState(pickup?.observation ?? "");
  const [result, setResult] = useState<"retirado" | "nao_realizada">(
    (pickup?.result as "retirado" | "nao_realizada") ?? "retirado"
  );
  const [reason, setReason] = useState(ATTEMPT_REASONS[0].value);
  const [note, setNote] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [equipment, setEquipment] = useState<EquipmentRow[]>(
    pickup && pickup.equipment.length > 0 ? pickup.equipment : [emptyEquipment()]
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const registrable = currentStatus === "ATRIBUIDO_MOTOBOY" || currentStatus === "EM_DESLOCAMENTO";

  function updateEquipment(index: number, patch: Partial<EquipmentRow>) {
    setEquipment((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const body = {
        courierId: courierId || undefined,
        observation: observation || undefined,
        result,
        reason: result === "nao_realizada" ? reason : undefined,
        note: result === "nao_realizada" ? note || undefined : undefined,
        proofUrl: proofUrl || undefined,
        equipment:
          result === "retirado"
            ? equipment
                .filter((r) => r.serialNumber || r.brand || r.model || r.assetTag || r.macAddress)
                .map((r) => ({ ...r, quantity: Number(r.quantity) || 1 }))
            : [],
      };
      const res = await fetch(`/api/pickups/${caseId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao registrar retirada");
        return;
      }
      setSuccess("Retirada registrada com sucesso.");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (!registrable) {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        Este caso está no status <strong>{currentStatus}</strong> e não aceita um novo registro de retirada
        (esperado: atribuído a motoboy ou em deslocamento). {pickup && "Uma retirada já foi registrada anteriormente."}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <div className="text-sm font-medium">Execução</div>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm space-y-1">
            <span style={{ color: "var(--text-muted)" }}>Motoboy</span>
            <select
              value={courierId}
              onChange={(e) => setCourierId(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
              style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
            >
              <option value="">-</option>
              {couriers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm space-y-1">
            <span style={{ color: "var(--text-muted)" }}>Resultado</span>
            <select
              value={result}
              onChange={(e) => setResult(e.target.value as "retirado" | "nao_realizada")}
              className="w-full rounded-lg border px-3 py-2"
              style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
            >
              <option value="retirado">Retirado</option>
              <option value="nao_realizada">Não realizada</option>
            </select>
          </label>
        </div>

        {result === "nao_realizada" && (
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-sm space-y-1">
              <span style={{ color: "var(--text-muted)" }}>Motivo</span>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-lg border px-3 py-2"
                style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
              >
                {ATTEMPT_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm space-y-1">
              <span style={{ color: "var(--text-muted)" }}>Observação da tentativa</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full rounded-lg border px-3 py-2"
                style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
              />
            </label>
          </div>
        )}

        <label className="text-sm space-y-1 block">
          <span style={{ color: "var(--text-muted)" }}>Observação geral</span>
          <textarea
            value={observation}
            onChange={(e) => setObservation(e.target.value)}
            rows={2}
            className="w-full rounded-lg border px-3 py-2"
            style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
          />
        </label>

        <label className="text-sm space-y-1 block">
          <span style={{ color: "var(--text-muted)" }}>
            URL do comprovante/foto{" "}
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              (upload de arquivo ainda não implementado — cole uma URL já hospedada)
            </span>
          </span>
          <input
            value={proofUrl}
            onChange={(e) => setProofUrl(e.target.value)}
            placeholder="https://..."
            className="w-full rounded-lg border px-3 py-2"
            style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
          />
        </label>
      </div>

      {result === "retirado" && (
        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Equipamentos retirados</div>
            <button
              type="button"
              onClick={() => setEquipment((rows) => [...rows, emptyEquipment()])}
              className="text-sm underline"
              style={{ color: "var(--brand)" }}
            >
              + adicionar equipamento
            </button>
          </div>

          {equipment.map((eq, i) => (
            <div key={i} className="grid sm:grid-cols-4 gap-2 border-t pt-3" style={{ borderColor: "var(--border)" }}>
              <select
                value={eq.type}
                onChange={(e) => updateEquipment(i, { type: e.target.value as EquipmentRow["type"] })}
                className="rounded-lg border px-2 py-1.5 text-sm"
                style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
              >
                {EQUIPMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <input
                placeholder="Marca"
                value={eq.brand}
                onChange={(e) => updateEquipment(i, { brand: e.target.value })}
                className="rounded-lg border px-2 py-1.5 text-sm"
                style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
              />
              <input
                placeholder="Modelo"
                value={eq.model}
                onChange={(e) => updateEquipment(i, { model: e.target.value })}
                className="rounded-lg border px-2 py-1.5 text-sm"
                style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
              />
              <input
                placeholder="Nº de série"
                value={eq.serialNumber}
                onChange={(e) => updateEquipment(i, { serialNumber: e.target.value })}
                className="rounded-lg border px-2 py-1.5 text-sm"
                style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
              />
              <input
                placeholder="MAC"
                value={eq.macAddress}
                onChange={(e) => updateEquipment(i, { macAddress: e.target.value })}
                className="rounded-lg border px-2 py-1.5 text-sm"
                style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
              />
              <input
                placeholder="Patrimônio"
                value={eq.assetTag}
                onChange={(e) => updateEquipment(i, { assetTag: e.target.value })}
                className="rounded-lg border px-2 py-1.5 text-sm"
                style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
              />
              <input
                type="number"
                min={1}
                placeholder="Qtd"
                value={eq.quantity}
                onChange={(e) => updateEquipment(i, { quantity: Number(e.target.value) || 1 })}
                className="rounded-lg border px-2 py-1.5 text-sm w-20"
                style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
              />
              <input
                placeholder="Condição"
                value={eq.condition}
                onChange={(e) => updateEquipment(i, { condition: e.target.value })}
                className="rounded-lg border px-2 py-1.5 text-sm"
                style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
              />
              <input
                placeholder="Observação"
                value={eq.observation}
                onChange={(e) => updateEquipment(i, { observation: e.target.value })}
                className="rounded-lg border px-2 py-1.5 text-sm sm:col-span-2"
                style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
              />
              {equipment.length > 1 && (
                <button
                  type="button"
                  onClick={() => setEquipment((rows) => rows.filter((_, idx) => idx !== i))}
                  className="text-xs underline text-left"
                  style={{ color: "var(--danger)" }}
                >
                  remover
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
          style={{ background: "var(--brand)", color: "var(--brand-fg)" }}
        >
          {loading ? "Salvando..." : "Registrar retirada"}
        </button>
        {error && <span style={{ color: "var(--danger)" }}>{error}</span>}
        {success && <span style={{ color: "var(--success)" }}>{success}</span>}
      </div>
    </form>
  );
}
