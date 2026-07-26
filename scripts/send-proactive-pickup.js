// Envia a mensagem inicial de contato ativo (a empresa chamando o cliente) sobre
// a retirada de equipamento, já deixando a conversa no estado certo para o cliente
// responder e cair no fluxo de retenção/agendamento normal do bot.
//
// Uso: node scripts/send-proactive-pickup.js 5519981541198 "Nome do Cliente"

require('dotenv').config();

const { upsertContact } = require('../lib/db');
const { startPickupFlow } = require('../lib/conversation');

async function main() {
  const waId = process.argv[2];
  const name = process.argv[3] || null;

  if (!waId) {
    console.error('Uso: node scripts/send-proactive-pickup.js <numero_whatsapp> ["Nome"]');
    process.exit(1);
  }

  await upsertContact(waId, name);

  await startPickupFlow(waId);

  console.log(`Mensagem de contato ativo enviada para ${waId}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Erro ao enviar contato ativo:', err);
  process.exit(1);
});
