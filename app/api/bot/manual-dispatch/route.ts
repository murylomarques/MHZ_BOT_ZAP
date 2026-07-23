import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";
import { writeAudit } from "@/lib/server/auth/audit";
import { getConversationalProvider } from "@/lib/server/providers";
import { transitionCase, InvalidTransitionError } from "@/lib/server/status/transitions";

export const maxDuration = 60;

// Ponte para o bot legado (CommonJS) — mantém o contato sincronizado na base
// do bot antes do envio, para que a resposta do cliente ao template (clique
// nos botões de motivo) caia no fluxo normal em lib/conversation.js.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const legacyDb = require("../../../../lib/db") as {
  upsertContact: (waId: string, profileName?: string | null) => Promise<unknown>;
};
// Template aprovado pela Meta que dispara o fluxo de retenção (já traz os
// botões de motivo do cancelamento embutidos — ver lib/conversation.js,
// que reconhece o clique nesses botões e entra direto na oferta de retenção).
const INITIAL_CONTACT_TEMPLATE_NAME = "msg_inicial_v1";

// Aceita tanto o texto cru da textarea (uma entrada por linha, "nome,telefone"
// ou apenas "telefone") quanto uma lista já estruturada — ver parseRawEntries.
type RawEntry = { name?: string | null; phone: string };
type RequestBody = { entries: string | RawEntry[] };

type EntryResult = {
  input: string;
  name: string | null;
  phone: string | null;
  valid: boolean;
  sent: boolean;
  caseId?: string;
  error?: string;
};

function isValidPhone(phone: string): boolean {
  return /^\d{12,13}$/.test(phone);
}

function parseRawEntries(raw: string): { input: string; name: string | null; phoneRaw: string }[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line.split(",").map((p) => p.trim());
      if (parts.length >= 2) {
        return { input: line, name: parts[0] || null, phoneRaw: parts.slice(1).join(",") };
      }
      return { input: line, name: null, phoneRaw: parts[0] };
    });
}

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission("campaigns_manage");
    const body = (await req.json()) as RequestBody;

    const parsed: { input: string; name: string | null; phoneRaw: string }[] =
      typeof body.entries === "string"
        ? parseRawEntries(body.entries)
        : (body.entries ?? []).map((e) => ({
            input: e.phone,
            name: e.name?.trim() || null,
            phoneRaw: e.phone,
          }));

    const results: EntryResult[] = [];
    const provider = getConversationalProvider();

    for (const entry of parsed) {
      const phone = entry.phoneRaw.replace(/\D/g, "");

      if (!phone || !isValidPhone(phone)) {
        results.push({
          input: entry.input,
          name: entry.name,
          phone: phone || null,
          valid: false,
          sent: false,
          error: "Telefone inválido (esperado 12 ou 13 dígitos, DDI+DDD+número)",
        });
        continue;
      }

      try {
        // Upsert do cliente pelo telefone.
        let customer = await prisma.customer.findFirst({ where: { phone } });
        if (!customer) {
          customer = await prisma.customer.create({
            data: {
              name: entry.name || phone,
              phone,
              city: "MANUAL",
              cityOriginal: null,
            },
          });
        }

        // Sempre cria uma nova SA/OS manual, mesmo repetindo o telefone — espelha
        // um contato repetido virando um novo caso, como pediria um disparo real.
        const saId = `MANUAL-${crypto.randomUUID().slice(0, 8)}`;
        const serviceOrder = await prisma.serviceOrder.create({
          data: { customerId: customer.id, saId },
        });
        const caseRecord = await prisma.caseRecord.create({
          data: { serviceOrderId: serviceOrder.id, status: "IMPORTADO" },
        });

        await transitionCase({ caseId: caseRecord.id, to: "PENDENTE_DISPARO", origin: "GESTOR", changedByUserId: session.sub });
        await transitionCase({ caseId: caseRecord.id, to: "PROCESSANDO_DISPARO", origin: "GESTOR", changedByUserId: session.sub });

        // Mantém o contato legado sincronizado antes do envio, igual ao script
        // de referência (scripts/send-proactive-pickup.js).
        await legacyDb.upsertContact(phone, entry.name ?? null);

        const sendResult = await provider.sendTemplate({
          to: phone,
          templateName: INITIAL_CONTACT_TEMPLATE_NAME,
          languageCode: "pt_BR",
        });

        if (sendResult.success) {
          await prisma.botMessage.create({
            data: {
              caseId: caseRecord.id,
              provider: "meta_whatsapp",
              externalId: sendResult.externalId,
              status: "ENVIADO",
              sentAt: new Date(),
            },
          });

          try {
            await transitionCase({ caseId: caseRecord.id, to: "MENSAGEM_ENVIADA", origin: "BOT" });
          } catch (transitionErr) {
            if (!(transitionErr instanceof InvalidTransitionError)) throw transitionErr;
          }

          // O template já traz os botões de motivo do cancelamento embutidos
          // — não precisa perguntar de novo. O clique do cliente é reconhecido
          // por lib/conversation.js independentemente do estado da conversa.

          results.push({ input: entry.input, name: entry.name, phone, valid: true, sent: true, caseId: caseRecord.id });
        } else {
          await prisma.botMessage.create({
            data: {
              caseId: caseRecord.id,
              provider: "meta_whatsapp",
              status: "ERRO",
              errorCode: sendResult.errorCode,
              errorMessage: sendResult.errorMessage,
            },
          });
          results.push({
            input: entry.input,
            name: entry.name,
            phone,
            valid: true,
            sent: false,
            caseId: caseRecord.id,
            error: sendResult.errorMessage ?? "Falha ao enviar mensagem",
          });
        }
      } catch (entryErr) {
        results.push({
          input: entry.input,
          name: entry.name,
          phone,
          valid: true,
          sent: false,
          error: entryErr instanceof Error ? entryErr.message : "Erro desconhecido ao processar entrada",
        });
      }
    }

    const summary = {
      total: results.length,
      invalidos: results.filter((r) => !r.valid).length,
      enviados: results.filter((r) => r.sent).length,
      erros: results.filter((r) => r.valid && !r.sent).length,
    };

    await writeAudit({
      userId: session.sub,
      action: "manual_dispatch",
      entity: "case_records",
      afterData: { summary, results },
      origin: "web",
    });

    return NextResponse.json({ summary, results });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao disparar mensagens manuais" },
      { status: 500 }
    );
  }
}
