import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";
import { prisma } from "@/lib/server/db/prisma";
import { scheduledVolunteerDispatch } from "@/workflows/scheduled-volunteer-dispatch";

const CAMPAIGN_ID = "33f1c001-4b09-4ae6-8e19-a98381dd7c09";
const SCHEDULE_DATE = "2026-07-28";

function saoPauloNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    hour: value("hour"),
  };
}

export async function GET(request: NextRequest) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const now = saoPauloNow();
  if (now.date !== SCHEDULE_DATE || now.hour !== "08") {
    return NextResponse.json({ started: false, reason: "Fora da data e hora autorizadas" });
  }

  const claimed = await prisma.botCampaign.updateMany({
    where: { id: CAMPAIGN_ID, status: "RASCUNHO" },
    data: { status: "EM_EXECUCAO" },
  });
  if (claimed.count !== 1) {
    return NextResponse.json({ started: false, reason: "Campanha já iniciada ou encerrada" });
  }

  try {
    const run = await start(scheduledVolunteerDispatch, [CAMPAIGN_ID]);
    return NextResponse.json({ started: true, runId: run.runId });
  } catch (error) {
    await prisma.botCampaign.updateMany({
      where: { id: CAMPAIGN_ID, status: "EM_EXECUCAO" },
      data: { status: "RASCUNHO" },
    });
    throw error;
  }
}
