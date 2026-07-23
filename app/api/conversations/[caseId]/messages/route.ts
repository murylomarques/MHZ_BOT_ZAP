import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/server/auth/rbac";
import { prisma } from "@/lib/server/db/prisma";
import { writeAudit } from "@/lib/server/auth/audit";
import { getConversationalProvider } from "@/lib/server/providers";

// Envia uma mensagem manual do atendente: registra a mensagem na conversa,
// dispara de fato via WhatsApp (MessagingProvider) e mantém um registro em
// bot_messages para consistência com o histórico já exibido em
// app/(app)/operacoes/[id]/page.tsx.
export async function POST(req: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
  try {
    const session = await requireUser();
    const { caseId } = await params;

    const body = (await req.json().catch(() => ({}))) as { text?: string };
    const text = body.text?.trim();
    if (!text) {
      return NextResponse.json({ error: "Mensagem vazia" }, { status: 400 });
    }

    const caseRecord = await prisma.caseRecord.findUnique({
      where: { id: caseId },
      include: { serviceOrder: { include: { customer: true } } },
    });
    if (!caseRecord) {
      return NextResponse.json({ error: "Caso não encontrado" }, { status: 404 });
    }

    const conversation = await prisma.conversation.upsert({
      where: { caseId },
      create: { caseId, ownerUserId: session.sub, queue: "ATRIBUIDO" },
      update: {},
    });

    const provider = getConversationalProvider();
    const sendResult = await provider.sendText({
      to: caseRecord.serviceOrder.customer.phone,
      body: text,
    });

    const [message] = await prisma.$transaction([
      prisma.conversationMessage.create({
        data: { conversationId: conversation.id, sender: "atendente", body: text },
      }),
      prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
      }),
      prisma.botMessage.create({
        data: {
          caseId,
          provider: "meta_whatsapp",
          direction: "outbound",
          externalId: sendResult.externalId,
          status: sendResult.success ? "ENVIADO" : "ERRO",
          errorCode: sendResult.errorCode,
          errorMessage: sendResult.errorMessage,
          sentAt: sendResult.success ? new Date() : null,
        },
      }),
    ]);

    await writeAudit({
      userId: session.sub,
      action: "conversation_message_send",
      entity: "conversations",
      entityId: conversation.id,
      afterData: { caseId, text, sendSuccess: sendResult.success },
      origin: "atendente",
    });

    return NextResponse.json({ message, sendResult });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
