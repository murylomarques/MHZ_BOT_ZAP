// Identifica o MAC do equipamento numa foto da etiqueta, via Claude vision.
// Sem ANTHROPIC_API_KEY configurada, retorna um MAC simulado (deixado claro
// na mensagem ao motoboy) — só pra demonstrar o fluxo ponta a ponta antes da
// chave existir. Assim que a env var for configurada, passa a funcionar de
// verdade sem precisar mexer em nenhum código.
const { getMediaUrl, downloadMediaBase64 } = require('./whatsapp-media');

const MAC_REGEX = /([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}/;
const MOCK_MAC = 'AA:BB:CC:DD:EE:FF';

async function extractMacFromImage(mediaId) {
  const mediaUrl = await getMediaUrl(mediaId);

  if (!process.env.ANTHROPIC_API_KEY) {
    return { mac: MOCK_MAC, mediaUrl, mocked: true };
  }

  const { base64, contentType } = await downloadMediaBase64(mediaUrl);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 50,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: contentType, data: base64 } },
            {
              type: 'text',
              text:
                'Leia a etiqueta do equipamento nesta foto e me diga apenas o endereço MAC, no formato ' +
                'XX:XX:XX:XX:XX:XX. Se não conseguir ler com certeza, responda exatamente NAO_ENCONTRADO. ' +
                'Não escreva mais nada além disso.',
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    console.error('[mac-vision] erro na API da Anthropic:', res.status, await res.text().catch(() => ''));
    return { mac: null, mediaUrl, mocked: false };
  }

  const json = await res.json();
  const text = json?.content?.[0]?.text?.trim() || '';
  const match = text.match(MAC_REGEX);
  return { mac: match ? match[0].toUpperCase() : null, mediaUrl, mocked: false };
}

module.exports = { extractMacFromImage };
