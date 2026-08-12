import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { prisma } from "@/lib/server/db/prisma";
import {
  invalidDispatchPasswordResponse,
  isValidDispatchPassword,
} from "@/lib/server/auth/dispatch-password";
import { scheduledVolunteerDispatch } from "@/workflows/scheduled-volunteer-dispatch";

export const runtime = "nodejs";

const CAMPAIGN_ID = "338391b0-3eef-433a-bd07-b7344aae965c";
const CAMPAIGN_NAME = "Disparo Elegiveis Sem Agendamento 1500 - 12-08-2026 08h";
const HARD_LIMIT = 1500;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { password?: unknown };
  if (!isValidDispatchPassword(body.password)) return invalidDispatchPasswordResponse();

  const [campaign, totalItems, uniquePhones] = await Promise.all([
    prisma.botCampaign.findUnique({
      where: { id: CAMPAIGN_ID },
      select: { name: true, status: true, maxSendPerRun: true, maxAttempts: true },
    }),
    prisma.botCampaignItem.count({ where: { campaignId: CAMPAIGN_ID } }),
    prisma.$queryRaw<Array<{ count: bigint }>>`
      select count(distinct c.phone)::bigint as count
        from bot_campaign_items bci
        join case_records cr on cr.id = bci.case_id
        join service_orders so on so.id = cr.service_order_id
        join customers c on c.id = so.customer_id
       where bci.campaign_id = ${CAMPAIGN_ID}::uuid
    `,
  ]);

  const uniquePhoneCount = Number(uniquePhones[0]?.count ?? 0);
  if (
    !campaign ||
    campaign.name !== CAMPAIGN_NAME ||
    campaign.status !== "RASCUNHO" ||
    campaign.maxSendPerRun !== HARD_LIMIT ||
    campaign.maxAttempts !== 1 ||
    totalItems !== HARD_LIMIT ||
    uniquePhoneCount !== HARD_LIMIT
  ) {
    return NextResponse.json(
      {
        error: "Lote bloqueado pela validação de segurança.",
        status: campaign?.status ?? null,
        totalItems,
        uniquePhoneCount,
      },
      { status: 409 }
    );
  }

  const claimed = await prisma.botCampaign.updateMany({
    where: { id: CAMPAIGN_ID, status: "RASCUNHO" },
    data: { status: "EM_EXECUCAO" },
  });
  if (claimed.count !== 1) {
    return NextResponse.json({ error: "Este lote já foi iniciado." }, { status: 409 });
  }

  try {
    const run = await start(scheduledVolunteerDispatch, [CAMPAIGN_ID]);
    return NextResponse.json({ ok: true, campaignId: CAMPAIGN_ID, runId: run.runId, total: HARD_LIMIT });
  } catch (error) {
    await prisma.botCampaign.updateMany({
      where: { id: CAMPAIGN_ID, status: "EM_EXECUCAO" },
      data: { status: "RASCUNHO" },
    });
    throw error;
  }
}
