import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";

// Marca/desmarca se o caso já foi comunicado pro grupo de motoboys (fora do
// sistema, ex: WhatsApp) — usa SQL cru porque a coluna notified_to_group
// ainda não foi adicionada ao schema.prisma/client (evitar regenerar o
// client no meio de uma operação em produção). Fica em case_records (não em
// appointments) porque o flag precisa estar disponível antes de existir um
// agendamento formal (ex: status CLIENTE_RESPONDEU).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;
    const json = await req.json().catch(() => null);
    const notified = json?.notified;
    if (typeof notified !== "boolean") {
      return NextResponse.json({ error: "Campo 'notified' (boolean) é obrigatório" }, { status: 400 });
    }

    const rows = await prisma.$queryRaw<{ id: string }[]>`
      UPDATE case_records SET notified_to_group = ${notified}, updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING id
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: "Caso não encontrado" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, notified });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
