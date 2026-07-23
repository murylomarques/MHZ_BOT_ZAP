import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";
import { runCsvImport } from "@/lib/server/import/csv-import";
import { writeAudit } from "@/lib/server/auth/audit";
import { runGeocodeQueueInBackground } from "@/lib/server/geocoding/queue";

export const maxDuration = 300;

// Responde assim que o arquivo é recebido, com o id do lote — o processamento
// pesado roda em segundo plano (não é aguardado aqui) e a tela acompanha o
// progresso via GET /api/import/status/[id] (polling). Isso evita a tela
// ficar travada por minutos num arquivo grande, sem indicação nenhuma de
// progresso nem se travou de verdade.
// Atenção: assim como a geocodificação, isso só funciona em servidor de longa
// duração (dev local, VPS) — não em função serverless que encerra ao responder.
export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission("import_run");

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 });
    }

    const content = await file.text();

    const batch = await prisma.importBatch.create({
      data: {
        fileName: file.name,
        fileHash: "pendente",
        importedByUserId: session.sub,
        totalRows: 0,
        status: "PROCESSANDO",
      },
    });

    (async () => {
      try {
        const summary = await runCsvImport({
          fileName: file.name,
          content,
          importedByUserId: session.sub,
          existingBatchId: batch.id,
        });

        await writeAudit({
          userId: session.sub,
          action: "import_csv",
          entity: "import_batches",
          entityId: summary.batchId,
          afterData: summary,
          origin: "web",
        });

        // Dispara a geocodificação dos endereços novos sozinha, em segundo
        // plano, assim que o import termina.
        runGeocodeQueueInBackground();
      } catch (err) {
        console.error("[import] erro no processamento em segundo plano:", err);
        await prisma.importBatch
          .update({
            where: { id: batch.id },
            data: {
              status: "ERRO",
              finishedAt: new Date(),
              errorMessage: err instanceof Error ? err.message : "Erro desconhecido",
            },
          })
          .catch(() => {});
      }
    })();

    return NextResponse.json({ batchId: batch.id });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao importar" },
      { status: 500 }
    );
  }
}
