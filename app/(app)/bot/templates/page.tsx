import Link from "next/link";
import { prisma } from "@/lib/server/db/prisma";
import { TemplateManager } from "./TemplateManager";

export const dynamic = "force-dynamic";

export default async function BotTemplatesPage() {
  const templates = await prisma.botTemplate.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Templates (HSM/Flow)</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Cadastro dos modelos de mensagem usados nas campanhas de disparo.
          </p>
        </div>
        <Link href="/bot" className="text-sm underline" style={{ color: "var(--brand)" }}>
          Voltar para campanhas
        </Link>
      </div>

      <TemplateManager
        templates={templates.map((t) => ({
          id: t.id,
          internalName: t.internalName,
          hsmCode: t.hsmCode,
          flowCode: t.flowCode,
          previewText: t.previewText,
          variables: t.variables,
          active: t.active,
          version: t.version,
        }))}
      />
    </div>
  );
}
