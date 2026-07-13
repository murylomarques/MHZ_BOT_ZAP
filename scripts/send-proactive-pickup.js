// Envia a mensagem inicial de contato ativo (a empresa chamando o cliente) sobre
// a retirada de equipamento, já deixando a conversa no estado certo para o cliente
// responder e cair no fluxo de retenção/agendamento normal do bot.
//
// Uso: node scripts/send-proactive-pickup.js 5519981541198 "Nome do Cliente"

require('dotenv').config();

const { sendButtons } = require('../lib/whatsapp');
const { upsertContact, setConversationState } = require('../lib/db');

async function main() {
  const waId = process.argv[2];
  const name = process.argv[3] || null;

  if (!waId) {
    console.error('Uso: node scripts/send-proactive-pickup.js <numero_whatsapp> ["Nome"]');
    process.exit(1);
  }

  await upsertContact(waId, name);

  const greeting = name ? `Olá, ${name}! 👋` : 'Olá! 👋';
  const body =
    `${greeting} Aqui é a equipe da MHZ. Vimos que você solicitou a retirada do equipamento de internet e ` +
    `queríamos falar com você antes de seguir com isso.\n\n` +
    `Conseguimos condições especiais para você continuar com a gente — inclusive dá pra fazer um novo contrato ` +
    `no nome de outra pessoa (um familiar, por exemplo), caso isso ajude.\n\n` +
    `Quer que a gente veja uma condição especial pra você continuar?`;

  await sendButtons(waId, body, [
    { id: 'retention_yes', title: 'Quero continuar' },
    { id: 'retention_no', title: 'Retirar equipamento' },
  ]);

  await setConversationState(waId, 'AWAITING_RETENTION_OFFER', {});

  console.log(`Mensagem de contato ativo enviada para ${waId}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Erro ao enviar contato ativo:', err);
  process.exit(1);
});
