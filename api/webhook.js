const { upsertContact, insertMessage, insertStatusUpdate } = require('../lib/db');
const { handleConversation } = require('../lib/conversation');

// Vercel serverless function: GET = verificação do webhook pela Meta, POST = eventos recebidos.
module.exports = async (req, res) => {
  if (req.method === 'GET') {
    return handleVerification(req, res);
  }

  if (req.method === 'POST') {
    return handleIncomingEvent(req, res);
  }

  res.status(405).send('Method Not Allowed');
};

function handleVerification(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.status(403).send('Forbidden');
}

async function handleIncomingEvent(req, res) {
  // Responde 200 imediatamente é recomendado pela Meta; processamos antes de responder
  // pois o volume aqui é baixo, mas erros não devem travar a resposta.
  try {
    const body = req.body || {};
    const entries = body.entry || [];

    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const value = change.value || {};
        await processMessages(value);
        await processStatuses(value);
      }
    }
  } catch (err) {
    console.error('Erro ao processar evento do webhook:', err);
  }

  res.status(200).send('EVENT_RECEIVED');
}

async function processMessages(value) {
  const messages = value.messages || [];
  if (!messages.length) return;

  const contactsInfo = value.contacts || [];
  const profileByWaId = new Map(contactsInfo.map((c) => [c.wa_id, c.profile?.name]));

  for (const msg of messages) {
    const waId = msg.from;
    const contactId = await upsertContact(waId, profileByWaId.get(waId));

    const { type } = msg;
    const body = type === 'text' ? msg.text?.body : null;
    const mediaUrl = msg[type]?.id || null; // Meta envia media id, não url direta

    await insertMessage({
      waMessageId: msg.id,
      contactId,
      direction: 'inbound',
      messageType: type,
      body,
      mediaUrl,
      waTimestamp: msg.timestamp ? new Date(Number(msg.timestamp) * 1000) : null,
      rawPayload: msg,
    });

    try {
      await handleConversation({ waId, contactId, msg, profileName: profileByWaId.get(waId) });
    } catch (err) {
      console.error('Erro ao processar conversa do bot:', err);
    }
  }
}

async function processStatuses(value) {
  const statuses = value.statuses || [];
  for (const status of statuses) {
    await insertStatusUpdate({
      waMessageId: status.id,
      status: status.status,
      waTimestamp: status.timestamp ? new Date(Number(status.timestamp) * 1000) : null,
      rawPayload: status,
    });
  }
}
