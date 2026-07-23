import type {
  MessagingProvider,
  SendTemplateInput,
  SendTextInput,
  SendResult,
  MessageStatus,
  ProcessedWebhookEvent,
} from "./messaging-provider";

/**
 * MOCK — a base importada mostra erros vindos de `desktop.matrixdobrasil.ai`
 * (HTTP 400 / timeout), então esse é o provedor real usado hoje para disparo
 * em massa de HSM/Flow. Não temos documentação nem credencial dessa API.
 *
 * Quando a integração real existir:
 *   1. Preencher MATRIX_DESKTOP_API_URL e MATRIX_DESKTOP_API_TOKEN no .env.
 *   2. Implementar sendTemplate/sendText fazendo a chamada HTTP real (ver
 *      MetaWhatsAppProvider para o padrão de erro/resultado esperado).
 *   3. Implementar validateWebhook com a verificação de assinatura que a
 *      Matrix/Desktop fornecer.
 *   4. Trocar a instância usada em `getMessagingProvider()` abaixo.
 *
 * Este mock nunca deve ser usado para enviar mensagem real — ele só
 * registra a intenção de envio e retorna sucesso simulado, para permitir
 * desenvolver o restante do fluxo de campanhas sem a integração real.
 */
export class MatrixDesktopProvider implements MessagingProvider {
  async sendTemplate(input: SendTemplateInput): Promise<SendResult> {
    if (!process.env.MATRIX_DESKTOP_API_URL) {
      return {
        success: true,
        externalId: `mock-${Date.now()}-${input.to}`,
      };
    }
    throw new Error(
      "MatrixDesktopProvider: MATRIX_DESKTOP_API_URL configurado mas a chamada real ainda não foi implementada."
    );
  }

  async sendText(input: SendTextInput): Promise<SendResult> {
    return this.sendTemplate({ to: input.to, templateName: "texto_livre", languageCode: "pt_BR" });
  }

  async getMessageStatus(externalId: string): Promise<MessageStatus> {
    return { externalId, status: "PENDENTE" };
  }

  async validateWebhook(): Promise<boolean> {
    return process.env.NODE_ENV !== "production";
  }

  async processWebhook(): Promise<ProcessedWebhookEvent[]> {
    return [];
  }
}
