export type SendTemplateInput = {
  to: string;
  templateName: string;
  languageCode: string;
  variables?: Record<string, string>;
};

export type SendTextInput = {
  to: string;
  body: string;
};

export type SendResult = {
  success: boolean;
  externalId?: string;
  errorCode?: string;
  errorMessage?: string;
};

export type MessageStatus = {
  externalId: string;
  status: "PENDENTE" | "ENVIADO" | "ENTREGUE" | "LIDO" | "ERRO";
  errorMessage?: string;
};

export type ProcessedWebhookEvent =
  | { type: "message_status"; externalId: string; status: MessageStatus["status"]; errorMessage?: string; raw: unknown }
  | { type: "inbound_message"; from: string; body: string; raw: unknown };

// Camada de adaptador pedida na seção 11 do spec: nada no resto do sistema faz
// fetch() direto para uma API de WhatsApp — tudo passa por esta interface, para
// permitir trocar de provedor sem tocar em regra de negócio.
export interface MessagingProvider {
  sendTemplate(input: SendTemplateInput): Promise<SendResult>;
  sendText(input: SendTextInput): Promise<SendResult>;
  getMessageStatus(externalId: string): Promise<MessageStatus>;
  validateWebhook(payload: unknown, signature?: string): Promise<boolean>;
  processWebhook(payload: unknown): Promise<ProcessedWebhookEvent[]>;
}
