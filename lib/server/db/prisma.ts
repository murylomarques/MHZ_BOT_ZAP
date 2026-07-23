import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Scripts administrativos de longa duração (ex.: importação em massa) devem
// rodar direto no Postgres, sem passar pelo pooler compartilhado com o app em
// produção — setar PRISMA_RUNTIME_DATABASE_URL (via env do processo, antes do
// node subir) para apontar para DIRECT_DATABASE_URL nesses casos.
const overrideUrl = process.env.PRISMA_RUNTIME_DATABASE_URL;

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient(overrideUrl ? { datasourceUrl: overrideUrl } : undefined);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
