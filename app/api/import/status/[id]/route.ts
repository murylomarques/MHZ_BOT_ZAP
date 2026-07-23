import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";

// Consultado por polling da tela de importações pra mostrar progresso em
// tempo real (linhas processadas, tempo decorrido, estimativa) enquanto o
// processamento roda em segundo plano — ver app/api/import/route.ts.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("import_run");
    const { id } = await params;

    const batch = await prisma.importBatch.findUnique({ where: { id } });
    if (!batch) {
      return NextResponse.json({ error: "Lote não encontrado" }, { status: 404 });
    }

    return NextResponse.json({ batch });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
