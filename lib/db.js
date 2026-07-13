const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

async function upsertContact(waId, profileName) {
  const { rows } = await getPool().query(
    `insert into contacts (wa_id, profile_name)
     values ($1, $2)
     on conflict (wa_id) do update
       set profile_name = coalesce(excluded.profile_name, contacts.profile_name),
           updated_at = now()
     returning id`,
    [waId, profileName || null]
  );
  return rows[0].id;
}

async function insertMessage({ waMessageId, contactId, direction, messageType, body, mediaUrl, waTimestamp, rawPayload }) {
  await getPool().query(
    `insert into messages
       (wa_message_id, contact_id, direction, message_type, body, media_url, wa_timestamp, raw_payload)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (wa_message_id) do nothing`,
    [waMessageId, contactId, direction, messageType, body, mediaUrl, waTimestamp, rawPayload]
  );
}

async function insertStatusUpdate({ waMessageId, status, waTimestamp, rawPayload }) {
  await getPool().query(
    `insert into message_status_updates (wa_message_id, status, wa_timestamp, raw_payload)
     values ($1, $2, $3, $4)`,
    [waMessageId, status, waTimestamp, rawPayload]
  );
}

async function getConversationState(waId) {
  const { rows } = await getPool().query(
    `select state, data from conversation_states where wa_id = $1`,
    [waId]
  );
  return rows[0] || null;
}

async function setConversationState(waId, state, data) {
  await getPool().query(
    `insert into conversation_states (wa_id, state, data, updated_at)
     values ($1, $2, $3, now())
     on conflict (wa_id) do update
       set state = excluded.state,
           data = excluded.data,
           updated_at = now()`,
    [waId, state, data || {}]
  );
}

async function clearConversationState(waId) {
  await getPool().query(`delete from conversation_states where wa_id = $1`, [waId]);
}

async function insertPickupRequest({ contactId, waId, pickupDate, period, address, contactPhone, observacao }) {
  await getPool().query(
    `insert into pickup_requests (contact_id, wa_id, pickup_date, period, address, contact_phone, observacao)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [contactId, waId, pickupDate, period, address, contactPhone, observacao || null]
  );
}

async function insertRetentionLead({
  contactId,
  waId,
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
  await getPool().query(
    `insert into retention_leads
       (contact_id, wa_id, nome_completo, cpf, rg, data_nascimento, nome_mae, email, endereco, plano, telefone1, telefone2)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [contactId, waId, nomeCompleto, cpf, rg, dataNascimento, nomeMae, email, endereco, plano, telefone1, telefone2 || null]
  );
}

module.exports = {
  getPool,
  upsertContact,
  insertMessage,
  insertStatusUpdate,
  getConversationState,
  setConversationState,
  clearConversationState,
  insertPickupRequest,
  insertRetentionLead,
};
