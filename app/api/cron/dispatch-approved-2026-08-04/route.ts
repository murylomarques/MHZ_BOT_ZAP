import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";
import { prisma } from "@/lib/server/db/prisma";
import { scheduledVolunteerDispatch } from "@/workflows/scheduled-volunteer-dispatch";

const CAMPAIGN_ID = "c68494f5-28fa-470f-9117-24efec9ddfde";
const CAMPAIGN_NAME = "Previa Prioridade Voluntario Completa Compulsorio 1000 - 04-08-2026";
const SCHEDULE_DATE = "2026-08-04";
const HARD_LIMIT = 1000;

function saoPauloNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${value("year")}-${value("month")}-${value("day")}`, hour: value("hour") };
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const now = saoPauloNow();
  if (now.date !== SCHEDULE_DATE || now.hour !== "08") {
    return NextResponse.json({ started: false, reason: "Fora da data e hora autorizadas" });
  }

  const [campaign, totalItems, uniquePhones] = await Promise.all([
    prisma.botCampaign.findUnique({ where: { id: CAMPAIGN_ID }, select: { name: true, status: true, maxSendPerRun: true, maxAttempts: true } }),
    prisma.botCampaignItem.count({ where: { campaignId: CAMPAIGN_ID } }),
    prisma.$queryRaw<Array<{ count: bigint }>>`
      select count(distinct c.phone)::bigint as count from bot_campaign_items bci
      join case_records cr on cr.id=bci.case_id join service_orders so on so.id=cr.service_order_id
      join customers c on c.id=so.customer_id where bci.campaign_id=${CAMPAIGN_ID}::uuid`,
  ]);
  const uniquePhoneCount = Number(uniquePhones[0]?.count ?? 0);
  if (!campaign || campaign.name !== CAMPAIGN_NAME || campaign.status !== "RASCUNHO" || campaign.maxSendPerRun !== HARD_LIMIT || campaign.maxAttempts !== 1 || totalItems !== HARD_LIMIT || uniquePhoneCount !== HARD_LIMIT) {
    return NextResponse.json({ started: false, reason: "Lote bloqueado pela validação", totalItems, uniquePhoneCount }, { status: 409 });
  }
  const claimed = await prisma.botCampaign.updateMany({ where: { id: CAMPAIGN_ID, status: "RASCUNHO" }, data: { status: "EM_EXECUCAO" } });
  if (claimed.count !== 1) return NextResponse.json({ started: false, reason: "Campanha já iniciada ou encerrada" }, { status: 409 });
  try {
    const run = await start(scheduledVolunteerDispatch, [CAMPAIGN_ID]);
    return NextResponse.json({ started: true, runId: run.runId, total: HARD_LIMIT });
  } catch (error) {
    await prisma.botCampaign.updateMany({ where: { id: CAMPAIGN_ID, status: "EM_EXECUCAO" }, data: { status: "RASCUNHO" } });
    throw error;
  }
}
