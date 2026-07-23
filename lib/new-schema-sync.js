// Ponte aditiva entre o webhook legado (api/webhook.js) e o schema novo do
// MHZ Retira (bot_messages, case_records, conversations, conversation_messages).
// Tudo aqui é best-effort: qualquer erro é engolido e logado, nunca deve
// impedir o fluxo legado do bot de continuar funcionando.
const { getPool } = require('./db');

const STATUS_MAP = { sent: 'ENVIADO', delivered: 'ENTREGUE', read: 'LIDO', failed: 'ERRO' };

const PERIOD_WINDOWS = {
  manha: { start: '08:00', end: '12:00' },
  tarde: { start: '13:00', end: '18:00' },
  noite: { start: '19:00', end: '22:00' },
};

// Status que já passaram da etapa de agendamento — não regride o caso se o
// bot receber um novo agendamento depois que a operação já avançou.
const LATE_PICKUP_STATUSES = [
  'AGENDADO',
  'AGUARDANDO_ROTA',
  'ROTA_PLANEJADA',
  'ATRIBUIDO_MOTOBOY',
  'EM_DESLOCAMENTO',
  'EQUIPAMENTO_RETIRADO',
  'AGUARDANDO_BAIXA',
  'BAIXA_PROCESSANDO',
  'BAIXA_REALIZADA',
  'FINALIZADO',
];

// Acha o caso aberto (não finalizado/cancelado) ligado a esse telefone no
// sistema novo — usado por toda sincronização aditiva vinda do bot legado.
async function findOpenCaseByPhone(pool, waId) {
  const { rows } = await pool.query(
    `select cr.id as case_id, cr.status
     from customers c
     join service_orders so on so.customer_id = c.id
     join case_records cr on cr.service_order_id = so.id
     where c.phone = $1 and cr.status not in ('FINALIZADO', 'CANCELADO')
     order by cr.updated_at desc
     limit 1`,
    [waId]
  );
  return rows[0] || null;
}

// Chamado quando a Meta manda um status (sent/delivered/read/failed) para uma
// mensagem que talvez tenha sido enviada pelo sistema novo (bot_messages.external_id).
async function syncOutboundStatus(waMessageId, status, rawPayload) {
  try {
    const mapped = STATUS_MAP[status];
    if (!mapped) return;

    const pool = getPool();
    const { rows } = await pool.query(
      `select id, case_id, status from bot_messages where external_id = $1`,
      [waMessageId]
    );
    if (rows.length === 0) return;
    const msg = rows[0];

    const fields = ['status = $2'];
    const values = [msg.id, mapped];
    if (mapped === 'ENTREGUE') fields.push(`delivered_at = coalesce(delivered_at, now())`);
    if (mapped === 'LIDO') fields.push(`read_at = coalesce(read_at, now())`);
    if (mapped === 'ERRO') {
      fields.push(`error_message = $${values.length + 1}`);
      values.push(rawPayload?.errors?.[0]?.message || null);
    }

    await pool.query(`update bot_messages set ${fields.join(', ')} where id = $1`, values);
    await pool.query(
      `insert into bot_message_events (id, message_id, event_type, raw_payload)
       values (gen_random_uuid(), $1, $2, $3)`,
      [msg.id, status, rawPayload]
    );

    if (!msg.case_id) return;

    // Avança o status do caso conforme a entrega progride, sem pular etapas —
    // se o caso já saiu do fluxo de envio (cliente respondeu, etc.), não mexe.
    if (mapped === 'ENTREGUE') {
      await pool.query(
        `update case_records set status = 'MENSAGEM_ENTREGUE', updated_at = now()
         where id = $1 and status = 'MENSAGEM_ENVIADA'`,
        [msg.case_id]
      );
      await insertStatusHistoryIfChanged(pool, msg.case_id, 'MENSAGEM_ENTREGUE', 'integracao', 'Confirmação de entrega da Meta');
    } else if (mapped === 'LIDO') {
      await pool.query(
        `update case_records set status = 'MENSAGEM_LIDA', updated_at = now()
         where id = $1 and status in ('MENSAGEM_ENVIADA', 'MENSAGEM_ENTREGUE')`,
        [msg.case_id]
      );
      await insertStatusHistoryIfChanged(pool, msg.case_id, 'MENSAGEM_LIDA', 'integracao', 'Confirmação de leitura da Meta');
    }
  } catch (err) {
    console.error('[new-schema-sync] erro ao sincronizar status:', err.message);
  }
}

async function insertStatusHistoryIfChanged(pool, caseId, toStatus, origin, reason) {
  const { rows } = await pool.query(`select status from case_records where id = $1`, [caseId]);
  if (rows[0]?.status !== toStatus) return; // update não bateu a condição WHERE, não avançou
  await pool.query(
    `insert into case_status_history (id, case_id, to_status, origin, reason, created_at)
     values (gen_random_uuid(), $1, $2, $3, $4, now())`,
    [caseId, toStatus, origin, reason]
  );
}

// Chamado quando chega uma mensagem inbound do cliente. Tenta achar um caso
// aberto vinculado a esse telefone e registrar a resposta na conversa nova.
async function syncInboundMessage(waId, body) {
  try {
    const pool = getPool();
    const openCase = await findOpenCaseByPhone(pool, waId);
    if (!openCase) return;
    const { case_id: caseId, status } = openCase;

    await pool.query(
      `insert into conversations (id, case_id, queue, last_message_at, created_at)
       values (gen_random_uuid(), $1, 'AGUARDANDO_ATENDENTE', now(), now())
       on conflict (case_id) do update set last_message_at = now()`,
      [caseId]
    );
    const { rows: convo } = await pool.query(`select id from conversations where case_id = $1`, [caseId]);
    if (convo[0]) {
      await pool.query(
        `insert into conversation_messages (id, conversation_id, sender, body, created_at)
         values (gen_random_uuid(), $1, 'cliente', $2, now())`,
        [convo[0].id, body || '']
      );
    }

    if (status === 'AGUARDANDO_RESPOSTA' || status === 'MENSAGEM_ENVIADA' || status === 'MENSAGEM_ENTREGUE' || status === 'MENSAGEM_LIDA') {
      await pool.query(
        `update case_records set status = 'CLIENTE_RESPONDEU', updated_at = now() where id = $1`,
        [caseId]
      );
      await pool.query(
        `insert into case_status_history (id, case_id, from_status, to_status, origin, reason, created_at)
         values (gen_random_uuid(), $1, $2, 'CLIENTE_RESPONDEU', 'BOT', 'Resposta recebida via WhatsApp', now())`,
        [caseId, status]
      );
    }
  } catch (err) {
    console.error('[new-schema-sync] erro ao sincronizar mensagem inbound:', err.message);
  }
}

// Chamado quando o cliente confirma um agendamento de retirada no fluxo do
// bot. Reflete a data/período/endereço no caso aberto do sistema novo, como
// se tivesse sido agendado pela Central de Atendimento.
async function syncPickupScheduled({ waId, pickupDate, period, address, contactPhone, observacao }) {
  try {
    const pool = getPool();
    const openCase = await findOpenCaseByPhone(pool, waId);
    if (!openCase) return;
    const { case_id: caseId, status } = openCase;

    const window = PERIOD_WINDOWS[period] || { start: '08:00', end: '18:00' };
    const observation = [observacao, contactPhone ? `Telefone alternativo: ${contactPhone}` : null]
      .filter(Boolean)
      .join(' | ') || null;

    const { rows: existing } = await pool.query(`select id from appointments where case_id = $1`, [caseId]);

    await pool.query(
      `insert into appointments (id, case_id, date, window_start, window_end, address, observation, confirmed_by_client, created_at, updated_at)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, true, now(), now())
       on conflict (case_id) do update set
         date = excluded.date,
         window_start = excluded.window_start,
         window_end = excluded.window_end,
         address = excluded.address,
         observation = excluded.observation,
         confirmed_by_client = true,
         updated_at = now()`,
      [caseId, pickupDate, window.start, window.end, address, observation]
    );

    const { rows: appt } = await pool.query(`select id from appointments where case_id = $1`, [caseId]);
    await pool.query(
      `insert into appointment_history (id, appointment_id, change_type, created_at)
       values (gen_random_uuid(), $1, $2, now())`,
      [appt[0].id, existing.length ? 'reagendado' : 'criado']
    );

    if (!LATE_PICKUP_STATUSES.includes(status)) {
      await pool.query(`update case_records set status = 'AGENDADO', updated_at = now() where id = $1`, [caseId]);
      await pool.query(
        `insert into case_status_history (id, case_id, from_status, to_status, origin, reason, created_at)
         values (gen_random_uuid(), $1, $2, 'AGENDADO', 'BOT', 'Agendamento de retirada via bot', now())`,
        [caseId, status]
      );
    }
  } catch (err) {
    console.error('[new-schema-sync] erro ao sincronizar agendamento de retirada:', err.message);
  }
}

// Chamado quando o cliente completa o cadastro de retenção no fluxo do bot
// (quis continuar com o plano em vez de retirar o equipamento). Registra os
// dados coletados como nota no caso aberto e marca o status de retido.
async function syncRetentionLead({
  waId,
  motivoLabel,
  nomeCompleto,
  cpf,
  rg,
  dataNascimento,
  nomeMae,
  email,
  endereco,
  plano,
  telefone1,
  telefone2,
}) {
  try {
    const pool = getPool();
    const openCase = await findOpenCaseByPhone(pool, waId);
    if (!openCase) return;
    const { case_id: caseId, status } = openCase;

    const body =
      `Lead de retenção via bot (motivo: ${motivoLabel || 'não informado'})\n` +
      `Nome: ${nomeCompleto || '-'}\n` +
      `CPF: ${cpf || '-'}\n` +
      `RG: ${rg || '-'}\n` +
      `Nascimento: ${dataNascimento || '-'}\n` +
      `Mãe: ${nomeMae || '-'}\n` +
      `Email: ${email || '-'}\n` +
      `Endereço: ${endereco || '-'}\n` +
      `Plano de interesse: ${plano || '-'}\n` +
      `Telefone 1: ${telefone1 || '-'}\n` +
      `Telefone 2: ${telefone2 || '-'}`;

    await pool.query(
      `insert into case_notes (id, case_id, body, created_at) values (gen_random_uuid(), $1, $2, now())`,
      [caseId, body]
    );

    if (status !== 'FINALIZADO') {
      await pool.query(`update case_records set status = 'CLIENTE_RETIDO', updated_at = now() where id = $1`, [caseId]);
      await pool.query(
        `insert into case_status_history (id, case_id, from_status, to_status, origin, reason, created_at)
         values (gen_random_uuid(), $1, $2, 'CLIENTE_RETIDO', 'BOT', 'Cliente optou por continuar - lead de retencao', now())`,
        [caseId, status]
      );
    }
  } catch (err) {
    console.error('[new-schema-sync] erro ao sincronizar lead de retenção:', err.message);
  }
}

module.exports = { syncOutboundStatus, syncInboundMessage, syncPickupScheduled, syncRetentionLead };
