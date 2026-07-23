import { NextRequest, NextResponse } from "next/server";
import type { ClosureStatus } from "@prisma/client";
import { requireUser, handleAuthError } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";

const VALID_STATUSES: ClosureStatus[] = ["AGUARDANDO", "PROCESSANDO", "REALIZADA", "ERRO", "DIVERGENCIA"];

// GET /api/closures?status=AGUARDANDO — lista SystemClosure filtrando por
// status, com o caso/OS/cliente/retirada relacionados.
export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get("status");
    const status =
      statusParam && VALID_STATUSES.includes(statusParam as ClosureStatus)
        ? (statusParam as ClosureStatus)
        : undefined;

    const closures = await prisma.systemClosure.findMany({
      where: status ? { status } : undefined,
      include: {
        pickup: {
          include: {
            caseRecord: { include: { serviceOrder: { include: { customer: true } } } },
            courier: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ closures });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
