import fs from "node:fs";
import { prisma } from "../lib/server/db/prisma";
import { runCsvImport } from "../lib/server/import/csv-import";

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Uso: tsx scripts/run-import.ts <caminho.csv>");
    process.exit(1);
  }

  const admin = await prisma.user.findUnique({ where: { email: "admin@mhzretira.com" } });
  if (!admin) {
    console.error("Usuário admin@mhzretira.com não encontrado — rode o seed primeiro.");
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, "utf-8");
  console.log(`Importando ${filePath} (${(content.length / 1024).toFixed(0)} KB)...`);

  const start = Date.now();
  const summary = await runCsvImport({
    fileName: filePath.split(/[\\/]/).pop() ?? filePath,
    content,
    importedByUserId: admin.id,
  });
  const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`Concluído em ${elapsedSec}s:`);
  console.log(summary);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
