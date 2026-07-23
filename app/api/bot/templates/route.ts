import { NextRequest, NextResponse } from "next/server";
import { requireUser, requirePermission, handleAuthError } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";
import { writeAudit } from "@/lib/server/auth/audit";

export async function GET() {
  try {
    await requireUser();
    const templates = await prisma.botTemplate.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json({ templates });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}

function parseVariables(input: unknown): string[] {
  if (Array.isArray(input)) return input.map((v) => String(v).trim()).filter(Boolean);
  if (typeof input === "string") {
    return input
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission("campaigns_manage");
    const body = await req.json();

    const internalName = String(body.internalName ?? "").trim();
    const previewText = String(body.previewText ?? "").trim();
    if (!internalName || !previewText) {
      return NextResponse.json(
        { error: "internalName e previewText são obrigatórios" },
        { status: 400 }
      );
    }

    const template = await prisma.botTemplate.create({
      data: {
        internalName,
        hsmCode: body.hsmCode ? String(body.hsmCode).trim() : null,
        flowCode: body.flowCode ? String(body.flowCode).trim() : null,
        previewText,
        variables: parseVariables(body.variables),
        active: body.active !== undefined ? Boolean(body.active) : true,
      },
    });

    await writeAudit({
      userId: session.sub,
      action: "bot_template_create",
      entity: "bot_templates",
      entityId: template.id,
      afterData: template,
      origin: "web",
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao criar template" },
      { status: 500 }
    );
  }
}
