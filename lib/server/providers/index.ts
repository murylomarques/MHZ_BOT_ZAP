import type { MessagingProvider } from "./messaging-provider";
import { MetaWhatsAppProvider } from "./meta-whatsapp-provider";
import { MatrixDesktopProvider } from "./matrix-desktop-provider";

const metaProvider = new MetaWhatsAppProvider();
const matrixProvider = new MatrixDesktopProvider();

// canal conversacional (respostas do bot) vs. canal de disparo em massa (campanhas).
export function getConversationalProvider(): MessagingProvider {
  return metaProvider;
}

export function getBulkDispatchProvider(): MessagingProvider {
  return matrixProvider;
}

export * from "./messaging-provider";
