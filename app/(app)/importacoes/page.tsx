import { prisma } from "@/lib/server/db/prisma";
import { ImportUploadForm } from "./ImportUploadForm";

export const dynamic = "force-dynamic";

export default async function ImportacoesPage() {
  const batches = await prisma.importBatch.findMany({
    orderBy: { startedAt: "desc" },
    take: 20,
    include: { importedByUser: { select: { name: true } } },
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Importações</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Importe a base de clientes/OS (CSV, separador ; ou ,) — upsert por SA, telefone não é chave única.
            Disparo, template e status de envio são controlados pelo sistema, não pela planilha.
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--danger)" }}>
            Atenção: formate a coluna de telefone como TEXTO antes de exportar do Excel/Sheets — se ela virar
            número, telefones grandes viram notação científica (ex: 5,52E+12) e perdem dígitos sem volta.
          </p>
        </div>
        <a
          href="/api/importacoes/exemplo"
          download
          className="rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap"
          style={{ border: "1px solid var(--border)", color: "var(--text)" }}
        >
          Baixar exemplo de base (CSV)
        </a>
      </div>

      <ImportUploadForm />

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b" style={{ borderColor: "var(--border)" }}>
              <th className="p-3">Arquivo</th>
              <th className="p-3">Usuário</th>
              <th className="p-3">Total</th>
              <th className="p-3">Criados</th>
              <th className="p-3">Atualizados</th>
              <th className="p-3">Removidos</th>
              <th className="p-3">Inválidos</th>
              <th className="p-3">SA dup.</th>
              <th className="p-3">WO dup.</th>
              <th className="p-3">Tel. dup.</th>
              <th className="p-3">Cidade desc.</th>
              <th className="p-3">Status</th>
              <th className="p-3">Duração</th>
              <th className="p-3">Data</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => {
              const durationMs = (b.finishedAt ?? new Date()).getTime() - b.startedAt.getTime();
              const durationMin = durationMs / 60000;
              const stuck = b.status === "PROCESSANDO" && durationMin > 15;
              return (
                <tr key={b.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                  <td className="p-3">{b.fileName}</td>
                  <td className="p-3">{b.importedByUser.name}</td>
                  <td className="p-3">{b.totalRows}</td>
                  <td className="p-3">{b.createdCount}</td>
                  <td className="p-3">{b.updatedCount}</td>
                  <td className="p-3">{b.removedCount}</td>
                  <td className="p-3">{b.invalidCount}</td>
                  <td className="p-3">{b.duplicateSaCount}</td>
                  <td className="p-3">{b.duplicateWoCount}</td>
                  <td className="p-3">{b.duplicatePhoneCount}</td>
                  <td className="p-3">{b.unknownCityCount}</td>
                  <td className="p-3">
                    <span style={{ color: stuck ? "var(--danger)" : undefined }}>
                      {b.status}
                      {stuck ? " ⚠️ (parece travado)" : ""}
                    </span>
                  </td>
                  <td className="p-3" style={{ color: "var(--text-muted)" }}>
                    {b.status === "PROCESSANDO"
                      ? `rodando há ${Math.round(durationMin)}min`
                      : `${Math.round(durationMin)}min`}
                  </td>
                  <td className="p-3" style={{ color: "var(--text-muted)" }}>
                    {b.startedAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                  </td>
                </tr>
              );
            })}
            {batches.length === 0 && (
              <tr>
                <td colSpan={14} className="p-6 text-center" style={{ color: "var(--text-muted)" }}>
                  Nenhuma importação realizada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
