import { NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";

export async function GET() {
  try {
    await requireUser();

    const quickReplies = await prisma.quickReply.findMany({
      where: { active: true },
      orderBy: { title: "asc" },
    });

    return NextResponse.json({ quickReplies });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
