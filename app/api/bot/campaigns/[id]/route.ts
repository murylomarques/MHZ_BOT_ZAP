import { NextRequest, NextResponse } from "next/server";
import type { CampaignStatus } from "@prisma/client";
import { requirePermission, handleAuthError } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";
import { writeAudit } from "@/lib/server/auth/audit";

// Transições permitidas por status atual (análogo a ALLOWED_TRANSITIONS de
// CaseStatus, mas para o ciclo de vida da campanha). RASCUNHO é o estado
// inicial; ENCERRADA é terminal.
const ALLOWED_CAMPAIGN_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  RASCUNHO: ["EM_EXECUCAO", "ENCERRADA"],
  EM_EXECUCAO: ["PAUSADA", "ENCERRADA"],
  PAUSADA: ["EM_EXECUCAO", "ENCERRADA"],
  ENCERRADA: [],
};

const ACTION_TO_STATUS: Record<string, CampaignStatus> = {
  iniciar: "EM_EXECUCAO",
  pausar: "PAUSADA",
  encerrar: "ENCERRADA",
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("campaigns_manage");
    const { id } = await params;
    const campaign = await prisma.botCampaign.findUnique({ where: { id } });
    if (!campaign) {
      return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });
    }

    const body = await req.json();
    const targetStatus: CampaignStatus | undefined = body.action
      ? ACTION_TO_STATUS[String(body.action)]
      : (body.status as CampaignStatus | undefined);

    if (!targetStatus) {
      return NextResponse.json({ error: "Ação ou status inválido" }, { status: 400 });
    }

    const allowed = ALLOWED_CAMPAIGN_TRANSITIONS[campaign.status] ?? [];
    if (!allowed.includes(targetStatus)) {
      return NextResponse.json(
        { error: `Transição não permitida: ${campaign.status} -> ${targetStatus}` },
        { status: 400 }
      );
    }

    const updated = await prisma.botCampaign.update({
      where: { id },
      data: { status: targetStatus },
    });

    await writeAudit({
      userId: session.sub,
      action: "bot_campaign_status_change",
      entity: "bot_campaigns",
      entityId: id,
      beforeData: { status: campaign.status },
      afterData: { status: updated.status },
      origin: "web",
    });

    return NextResponse.json({ campaign: updated });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao atualizar campanha" },
      { status: 500 }
    );
  }
}
