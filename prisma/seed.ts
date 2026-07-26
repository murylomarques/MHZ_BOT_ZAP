import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "MhzRetira@2026";

async function upsertUser(email: string, name: string, role: "ADMIN" | "GESTOR" | "ATENDENTE") {
  const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });
  return prisma.user.upsert({
    where: { email },
    create: { email, name, role, passwordHash },
    update: { name, role },
  });
}

async function main() {
  const admin = await upsertUser("admin@mhzretira.com", "Administrador MHZ", "ADMIN");
  await upsertUser("gestor@mhzretira.com", "Gestor Operacional", "GESTOR");
  await upsertUser("atendente1@mhzretira.com", "Ana Atendente", "ATENDENTE");
  await upsertUser("atendente2@mhzretira.com", "Bruno Atendente", "ATENDENTE");
  await upsertUser("atendente3@mhzretira.com", "Carla Atendente", "ATENDENTE");

  await prisma.courier.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Motoboy Demo 1",
      phone: "5511900000001",
      vehicleType: "moto",
    },
    update: {},
  });

  await prisma.botTemplate.upsert({
    where: { id: "00000000-0000-0000-0000-000000000010" },
    create: {
      id: "00000000-0000-0000-0000-000000000010",
      internalName: "Retirada — foco em agendamento",
      hsmCode: "msg_inicio_foco_retiradas",
      previewText:
        "Vamos agendar sua retirada. O processo possui apenas 3 etapas e leva menos de 1 minuto: " +
        "confirmar o endereço, escolher a data e o período, revisar e confirmar. [botão: Começar]",
      variables: ["customer_name"],
    },
    update: {
      internalName: "Retirada — foco em agendamento",
      hsmCode: "msg_inicio_foco_retiradas",
      flowCode: null,
      previewText:
        "Vamos agendar sua retirada. O processo possui apenas 3 etapas e leva menos de 1 minuto: " +
        "confirmar o endereço, escolher a data e o período, revisar e confirmar. [botão: Começar]",
      variables: ["customer_name"],
    },
  });

  await prisma.botCampaign.upsert({
    where: { id: "00000000-0000-0000-0000-000000000020" },
    create: {
      id: "00000000-0000-0000-0000-000000000020",
      name: "Campanha exemplo — Campinas",
      templateId: "00000000-0000-0000-0000-000000000010",
      status: "RASCUNHO",
      cities: ["Campinas"],
      createdByUserId: admin.id,
    },
    update: {},
  });

  console.log("Seed concluído. Senha de demonstração para todos os usuários:", DEMO_PASSWORD);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
