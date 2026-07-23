import type {
  MessagingProvider,
  SendTemplateInput,
  SendTextInput,
  SendResult,
  MessageStatus,
  ProcessedWebhookEvent,
} from "./messaging-provider";

// Reaproveita o cliente já em produção (lib/whatsapp.js) em vez de duplicar a
// chamada HTTP à Graph API — é o canal conversacional real do bot.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const legacyWhatsapp = require("../../whatsapp.js") as {
  sendText: (to: string, body: string) => Promise<Response>;
};

const GRAPH_VERSION = "v21.0";

async function callGraphApi(payload: Record<string, unknown>): Promise<SendResult> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      success: false,
      errorCode: String(data?.error?.code ?? res.status),
      errorMessage: data?.error?.message ?? "Erro ao enviar mensagem",
    };
  }
  return { success: true, externalId: data?.messages?.[0]?.id };
}

export class MetaWhatsAppProvider implements MessagingProvider {
  async sendTemplate(input: SendTemplateInput): Promise<SendResult> {
    return callGraphApi({
      messaging_product: "whatsapp",
      to: input.to,
      type: "template",
      template: {
        name: input.templateName,
        language: { code: input.languageCode },
        components: input.variables
          ? [
              {
                type: "body",
                parameters: Object.values(input.variables).map((text) => ({ type: "text", text })),
              },
            ]
          : undefined,
      },
    });
  }

  async sendText(input: SendTextInput): Promise<SendResult> {
    const res = await legacyWhatsapp.sendText(input.to, input.body);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { success: false, errorCode: String(res.status), errorMessage: body };
    }
    const data = (await res.json().catch(() => ({}))) as { messages?: { id: string }[] };
    return { success: true, externalId: data.messages?.[0]?.id };
  }

  async getMessageStatus(): Promise<MessageStatus> {
    // A Meta não expõe um endpoint de consulta de status por id — o status
    // chega via webhook (ver processWebhook) e é persistido em bot_message_events.
    throw new Error("MetaWhatsAppProvider.getMessageStatus: use os eventos do webhook, não há polling na Graph API.");
  }

  async validateWebhook(): Promise<boolean> {
    // A validação de assinatura (X-Hub-Signature-256) já é feita na fronteira
    // do webhook legado (api/webhook.js) antes de chegar aqui.
    return true;
  }

  async processWebhook(payload: unknown): Promise<ProcessedWebhookEvent[]> {
    const events: ProcessedWebhookEvent[] = [];
    const body = payload as {
      entry?: { changes?: { value?: { statuses?: unknown[]; messages?: unknown[] } }[] }[];
    };

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value ?? {};
        for (const status of (value.statuses ?? []) as { id: string; status: string; errors?: { message: string }[] }[]) {
          events.push({
            type: "message_status",
            externalId: status.id,
            status: mapMetaStatus(status.status),
            errorMessage: status.errors?.[0]?.message,
            raw: status,
          });
        }
        for (const msg of (value.messages ?? []) as { from: string; text?: { body: string } }[]) {
          events.push({ type: "inbound_message", from: msg.from, body: msg.text?.body ?? "", raw: msg });
        }
      }
    }
    return events;
  }
}

function mapMetaStatus(status: string): MessageStatus["status"] {
  switch (status) {
    case "sent":
      return "ENVIADO";
    case "delivered":
      return "ENTREGUE";
    case "read":
      return "LIDO";
    case "failed":
      return "ERRO";
    default:
      return "PENDENTE";
  }
}
