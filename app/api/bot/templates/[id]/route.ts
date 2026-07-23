import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";
import { writeAudit } from "@/lib/server/auth/audit";

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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("campaigns_manage");
    const { id } = await params;
    const existing = await prisma.botTemplate.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Template não encontrado" }, { status: 404 });
    }

    const body = await req.json();

    const internalName =
      body.internalName !== undefined ? String(body.internalName).trim() : existing.internalName;
    const previewText =
      body.previewText !== undefined ? String(body.previewText).trim() : existing.previewText;
    const hsmCode =
      body.hsmCode !== undefined ? (body.hsmCode ? String(body.hsmCode).trim() : null) : existing.hsmCode;
    const flowCode =
      body.flowCode !== undefined ? (body.flowCode ? String(body.flowCode).trim() : null) : existing.flowCode;
    const variables =
      body.variables !== undefined ? parseVariables(body.variables) : (existing.variables as string[]);
    const active = body.active !== undefined ? Boolean(body.active) : existing.active;

    if (!internalName || !previewText) {
      return NextResponse.json(
        { error: "internalName e previewText são obrigatórios" },
        { status: 400 }
      );
    }

    const contentChanged =
      internalName !== existing.internalName ||
      previewText !== existing.previewText ||
      hsmCode !== existing.hsmCode ||
      flowCode !== existing.flowCode ||
      JSON.stringify(variables) !== JSON.stringify(existing.variables);

    const template = await prisma.botTemplate.update({
      where: { id },
      data: {
        internalName,
        previewText,
        hsmCode,
        flowCode,
        variables,
        active,
        version: contentChanged ? existing.version + 1 : existing.version,
      },
    });

    await writeAudit({
      userId: session.sub,
      action: "bot_template_update",
      entity: "bot_templates",
      entityId: template.id,
      beforeData: existing,
      afterData: template,
      origin: "web",
    });

    return NextResponse.json({ template });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao atualizar template" },
      { status: 500 }
    );
  }
}
