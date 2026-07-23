import { NextRequest, NextResponse } from "next/server";
import { requireUser, requirePermission, handleAuthError } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";
import { writeAudit } from "@/lib/server/auth/audit";
import { KNOWN_CITIES } from "@/lib/server/bot/cities";
import { getCampaignIndicators } from "@/lib/server/bot/campaign-indicators";

export async function GET() {
  try {
    await requireUser();
    const campaigns = await prisma.botCampaign.findMany({
      orderBy: { createdAt: "desc" },
      include: { template: { select: { id: true, internalName: true } } },
    });

    const withIndicators = await Promise.all(
      campaigns.map(async (c) => ({ campaign: c, indicators: await getCampaignIndicators(c.id) }))
    );

    return NextResponse.json({ campaigns: withIndicators });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission("campaigns_manage");
    const body = await req.json();

    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Nome da campanha é obrigatório" }, { status: 400 });
    }

    const cities: string[] = Array.isArray(body.cities) ? body.cities.map((c: unknown) => String(c).trim()) : [];
    const unknownCities = cities.filter((c) => !(KNOWN_CITIES as readonly string[]).includes(c));
    if (unknownCities.length > 0) {
      return NextResponse.json(
        { error: `Cidade(s) não reconhecida(s): ${unknownCities.join(", ")}` },
        { status: 400 }
      );
    }

    if (body.templateId) {
      const template = await prisma.botTemplate.findUnique({ where: { id: String(body.templateId) } });
      if (!template) {
        return NextResponse.json({ error: "Template não encontrado" }, { status: 400 });
      }
    }

    const campaign = await prisma.botCampaign.create({
      data: {
        name,
        templateId: body.templateId ? String(body.templateId) : null,
        cities,
        maxSendPerRun: body.maxSendPerRun !== undefined ? Number(body.maxSendPerRun) : 50,
        intervalSeconds: body.intervalSeconds !== undefined ? Number(body.intervalSeconds) : null,
        windowStart: body.windowStart ? String(body.windowStart) : "08:00",
        windowEnd: body.windowEnd ? String(body.windowEnd) : "20:00",
        allowedWeekdays: Array.isArray(body.allowedWeekdays)
          ? body.allowedWeekdays.map((d: unknown) => Number(d))
          : [1, 2, 3, 4, 5],
        maxAttempts: body.maxAttempts !== undefined ? Number(body.maxAttempts) : 3,
        createdByUserId: session.sub,
      },
    });

    await writeAudit({
      userId: session.sub,
      action: "bot_campaign_create",
      entity: "bot_campaigns",
      entityId: campaign.id,
      afterData: campaign,
      origin: "web",
    });

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao criar campanha" },
      { status: 500 }
    );
  }
}
