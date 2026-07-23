import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { CaseStatus } from "@prisma/client";
import { requirePermission, handleAuthError } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";
import { writeAudit } from "@/lib/server/auth/audit";
import { transitionCase, InvalidTransitionError } from "@/lib/server/status/transitions";

const EQUIPMENT_TYPES = [
  "ONU",
  "ROTEADOR",
  "MODEM",
  "FONTE",
  "CONTROLE",
  "REPETIDOR",
  "CABO",
  "OUTROS",
] as const;

const ATTEMPT_REASONS = [
  "cliente_ausente",
  "endereco_incorreto",
  "cliente_mudou",
  "cliente_recusou",
  "equipamento_nao_localizado",
  "regiao_de_risco",
  "problema_veiculo",
  "cancelada",
  "outros",
] as const;

// Status a partir dos quais é permitido registrar a execução da retirada.
const REGISTRABLE_STATUSES: CaseStatus[] = ["ATRIBUIDO_MOTOBOY", "EM_DESLOCAMENTO"];

// Mapeia o motivo da não realização para o status do caso, conforme seção 15
// do spec: só existem 3 status de destino possíveis (não existe um status por
// motivo individual).
function statusForReason(reason: (typeof ATTEMPT_REASONS)[number]): CaseStatus {
  if (reason === "cliente_ausente") return "CLIENTE_AUSENTE";
  if (reason === "endereco_incorreto" || reason === "equipamento_nao_localizado") {
    return "ENDERECO_NAO_LOCALIZADO";
  }
  return "RETIRADA_NAO_REALIZADA";
}

const equipmentSchema = z.object({
  type: z.enum(EQUIPMENT_TYPES),
  brand: z.string().optional(),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
  macAddress: z.string().optional(),
  assetTag: z.string().optional(),
  quantity: z.number().int().min(1).default(1),
  condition: z.string().optional(),
  observation: z.string().optional(),
  photoUrl: z.string().optional(),
});

const bodySchema = z.object({
  courierId: z.string().uuid().optional(),
  observation: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  result: z.enum(["retirado", "nao_realizada"]),
  reason: z.enum(ATTEMPT_REASONS).optional(),
  note: z.string().optional(),
  proofUrl: z.string().url().optional(),
  equipment: z.array(equipmentSchema).default([]),
});

// POST /api/pickups/[caseId] — registra a execução de uma retirada (seção 15).
//
// Simplificação assumida: como não existe infraestrutura de upload de
// arquivo (S3/blob) no projeto ainda, o "comprovante/foto" é aceito apenas
// como uma URL de texto livre (`proofUrl`) que vira um `PickupProof.fileUrl`.
// Quando existir upload real, trocar o input por um file picker + endpoint de
// upload, mantendo este contrato (recebe uma URL já hospedada).
//
// Decisão de implementação para os equipamentos: em vez de aceitar adições
// incrementais, cada chamada substitui a lista de equipamentos da retirada
// (delete-then-recreate), pois a tela envia o formulário completo a cada
// submit — mais simples e evita duplicar linhas em reenvios.
export async function POST(req: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
  try {
    const session = await requirePermission("cases_assign");
    const { caseId } = await params;

    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
    }
    const data = parsed.data;

    if (data.result === "nao_realizada" && !data.reason) {
      return NextResponse.json(
        { error: "Motivo é obrigatório quando a retirada não foi realizada." },
        { status: 400 }
      );
    }

    const caseRecord = await prisma.caseRecord.findUnique({
      where: { id: caseId },
      include: { pickup: true },
    });
    if (!caseRecord) {
      return NextResponse.json({ error: "Caso não encontrado" }, { status: 404 });
    }
    if (!REGISTRABLE_STATUSES.includes(caseRecord.status)) {
      return NextResponse.json(
        {
          error: `Não é possível registrar retirada com o caso no status atual (${caseRecord.status}). Esperado: atribuído a motoboy ou em deslocamento.`,
        },
        { status: 409 }
      );
    }

    const pickup = await prisma.$transaction(async (tx) => {
      const upserted = await tx.pickup.upsert({
        where: { caseId },
        update: {
          courierId: data.courierId ?? caseRecord.pickup?.courierId ?? null,
          performedAt: new Date(),
          performedByUserId: session.sub,
          result: data.result,
          observation: data.observation ?? null,
          latitude: data.latitude ?? null,
          longitude: data.longitude ?? null,
        },
        create: {
          caseId,
          courierId: data.courierId ?? null,
          performedAt: new Date(),
          performedByUserId: session.sub,
          result: data.result,
          observation: data.observation ?? null,
          latitude: data.latitude ?? null,
          longitude: data.longitude ?? null,
        },
      });

      await tx.pickupEquipment.deleteMany({ where: { pickupId: upserted.id } });
      if (data.equipment.length > 0) {
        await tx.pickupEquipment.createMany({
          data: data.equipment.map((eq) => ({
            pickupId: upserted.id,
            type: eq.type,
            brand: eq.brand,
            model: eq.model,
            serialNumber: eq.serialNumber,
            macAddress: eq.macAddress,
            assetTag: eq.assetTag,
            quantity: eq.quantity,
            condition: eq.condition,
            observation: eq.observation,
            photoUrl: eq.photoUrl,
          })),
        });
      }

      if (data.proofUrl) {
        await tx.pickupProof.create({
          data: { pickupId: upserted.id, fileUrl: data.proofUrl, kind: "foto" },
        });
      }

      if (data.result === "nao_realizada" && data.reason) {
        await tx.pickupAttempt.create({
          data: { pickupId: upserted.id, reason: data.reason, note: data.note },
        });
      }

      return upserted;
    });

    try {
      if (data.result === "retirado") {
        await transitionCase({
          caseId,
          to: "EQUIPAMENTO_RETIRADO",
          origin: "ATENDENTE",
          reason: "Retirada registrada",
          note: data.observation,
          changedByUserId: session.sub,
        });
        await transitionCase({
          caseId,
          to: "AGUARDANDO_BAIXA",
          origin: "ATENDENTE",
          reason: "Retirada concluída — aguardando baixa no sistema externo",
          changedByUserId: session.sub,
        });

        // Baixas (fase 12) precisam de um registro de fechamento para operar
        // — criado automaticamente aqui, status AGUARDANDO, ligado à retirada.
        await prisma.systemClosure.upsert({
          where: { pickupId: pickup.id },
          update: {},
          create: { pickupId: pickup.id },
        });
      } else if (data.reason) {
        await transitionCase({
          caseId,
          to: statusForReason(data.reason),
          origin: "ATENDENTE",
          reason: `Retirada não realizada: ${data.reason}`,
          note: data.note,
          changedByUserId: session.sub,
        });
      }
    } catch (err) {
      if (err instanceof InvalidTransitionError) {
        return NextResponse.json(
          {
            error:
              "A retirada foi registrada, mas o caso não pôde mudar de status a partir do estado atual.",
          },
          { status: 409 }
        );
      }
      throw err;
    }

    await writeAudit({
      userId: session.sub,
      action: "pickup_register",
      entity: "pickups",
      entityId: pickup.id,
      afterData: { caseId, result: data.result, reason: data.reason },
      origin: "atendente",
    });

    return NextResponse.json({ pickup });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
