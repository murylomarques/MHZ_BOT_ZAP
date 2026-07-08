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

module.exports = { getPool, upsertContact, insertMessage, insertStatusUpdate };
