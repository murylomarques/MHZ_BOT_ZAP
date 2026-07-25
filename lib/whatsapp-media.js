// Resolve mídia recebida pelo WhatsApp (foto do motoboy) — a Meta guarda o
// arquivo nos servidores dela e só dá uma URL temporária (expira depois de
// um tempo). Sem storage próprio configurado no projeto ainda, guardamos só
// essa referência temporária (combinado com o usuário).
const GRAPH_VERSION = 'v21.0';

async function getMediaUrl(mediaId) {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Erro ao resolver mídia ${mediaId}: ${res.status}`);
  const json = await res.json();
  return json.url;
}

async function downloadMediaBase64(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } });
  if (!res.ok) throw new Error(`Erro ao baixar mídia: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { base64: buf.toString('base64'), contentType: res.headers.get('content-type') || 'image/jpeg' };
}

module.exports = { getMediaUrl, downloadMediaBase64 };
