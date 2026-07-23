import { NextResponse } from "next/server";
import { clearSessionCookie, getCurrentSession } from "@/lib/server/auth/session";
import { writeAudit } from "@/lib/server/auth/audit";

export async function POST() {
  const session = await getCurrentSession();
  await clearSessionCookie();
  if (session) {
    await writeAudit({ userId: session.sub, action: "logout", entity: "app_users", entityId: session.sub });
  }
  return NextResponse.json({ ok: true });
}
