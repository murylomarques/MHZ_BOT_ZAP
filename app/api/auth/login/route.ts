import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/server/db/prisma";
import { verifyPassword } from "@/lib/server/auth/password";
import { createSessionToken, setSessionCookie } from "@/lib/server/auth/session";
import { isLoginRateLimited, writeAudit } from "@/lib/server/auth/audit";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const { email, password } = parsed.data;
  const ip = req.headers.get("x-forwarded-for") ?? null;
  const userAgent = req.headers.get("user-agent");

  if (await isLoginRateLimited(email, ip)) {
    return NextResponse.json(
      { error: "Muitas tentativas. Tente novamente em alguns minutos." },
      { status: 429 }
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || user.status === "BLOQUEADO" || !(await verifyPassword(user.passwordHash, password))) {
    await writeAudit({
      action: "login_failed",
      entity: "app_users",
      entityId: email,
      ip,
      userAgent,
      origin: "web",
    });
    return NextResponse.json({ error: "E-mail ou senha inválidos" }, { status: 401 });
  }

  const token = await createSessionToken({
    sub: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
  });
  await setSessionCookie(token);

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await writeAudit({
    userId: user.id,
    action: "login",
    entity: "app_users",
    entityId: user.id,
    ip,
    userAgent,
    origin: "web",
  });

  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}
