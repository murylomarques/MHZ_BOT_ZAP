import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";
import { writeAudit } from "@/lib/server/auth/audit";

// Reprocessar erros: volta itens ERRO para PENDENTE (respeitando maxAttempts
// da campanha) para que uma próxima rodada de disparo os tente novamente.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("campaigns_manage");
    const { id: campaignId } = await params;

    const campaign = await prisma.botCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) {
      return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });
    }

    const result = await prisma.botCampaignItem.updateMany({
      where: { campaignId, status: "ERRO", attempts: { lt: campaign.maxAttempts } },
      data: { status: "PENDENTE" },
    });

    await writeAudit({
      userId: session.sub,
      action: "bot_campaign_reprocess_errors",
      entity: "bot_campaigns",
      entityId: campaignId,
      afterData: { reprocessed: result.count },
      origin: "web",
    });

    return NextResponse.json({ reprocessed: result.count });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao reprocessar" },
      { status: 500 }
    );
  }
}
