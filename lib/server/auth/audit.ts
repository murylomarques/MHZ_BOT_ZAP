import { prisma } from "../db/prisma";

export async function writeAudit(entry: {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  beforeData?: unknown;
  afterData?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  origin?: string | null;
}) {
  await prisma.auditLog.create({
    data: {
      userId: entry.userId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      beforeData: entry.beforeData as never,
      afterData: entry.afterData as never,
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
      origin: entry.origin ?? null,
    },
  });
}

const LOGIN_WINDOW_MINUTES = 15;
const LOGIN_MAX_ATTEMPTS = 8;

export async function isLoginRateLimited(email: string, ip: string | null): Promise<boolean> {
  const since = new Date(Date.now() - LOGIN_WINDOW_MINUTES * 60_000);
  const count = await prisma.auditLog.count({
    where: {
      action: "login_failed",
      entity: "app_users",
      createdAt: { gte: since },
      OR: [{ entityId: email }, { ip: ip ?? undefined }],
    },
  });
  return count >= LOGIN_MAX_ATTEMPTS;
}
