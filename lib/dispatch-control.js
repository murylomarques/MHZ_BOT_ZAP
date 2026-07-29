const { getPool } = require('./db');
const { sendText, sendButtons } = require('./whatsapp');

const CONTROL_WA_ID = '5519982693395';
const MENU_BUTTONS = [
  { id: 'dispatch_start', title: 'Iniciar atendimentos' },
  { id: 'dispatch_totals', title: 'Ver quantidades' },
];

function extractInput(msg) {
  if (msg.type === 'text') return { kind: 'text', value: (msg.text?.body || '').trim() };
  if (msg.type === 'interactive') {
    const interactive = msg.interactive || {};
    if (interactive.type === 'button_reply') {
      return { kind: 'interactive', id: interactive.button_reply.id };
    }
    if (interactive.type === 'list_reply') {
      return { kind: 'interactive', id: interactive.list_reply.id };
    }
  }
  return { kind: 'unknown' };
}

async function ensureDispatchLog(pool) {
  await pool.query(
    `create table if not exists whatsapp_dispatch_log (
       appointment_id uuid primary key references appointments(id) on delete cascade,
       recipient_wa_id text not null,
       claimed_at timestamptz not null default now(),
       sent_at timestamptz
     )`
  );
}

function periodLabel(start) {
  const hour = Number(String(start || '').slice(0, 2));
  if (hour < 13) return 'Manhã';
  if (hour < 19) return 'Tarde';
  return 'Noite';
}

function cleanObservation(value) {
  const observation = String(value || '')
    .split(' | Telefone alternativo:')[0]
    .trim();
  return observation || 'Não';
}

function formatAppointment(row) {
  const address = row.address || 'Não informado';
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  const date = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(`${row.date_iso}T00:00:00Z`));

  return (
    `[GRUPO: ${(row.city || 'SEM CIDADE').toUpperCase()}]\n` +
    `SA: ${row.sa_number || row.sa_id}\n` +
    `Nome: ${row.customer_name}\n` +
    `Número: ${row.customer_phone}\n` +
    `Endereço: ${address}\n` +
    `Endereço confirmado pelo cliente: ${row.confirmed_by_client ? 'Sim' : 'Não'}\n` +
    `Observação informada pelo cliente: ${cleanObservation(row.observation)}\n` +
    `Mapa: ${mapUrl}\n` +
    `Horário: ${periodLabel(row.window_start)}\n` +
    `${date}`
  );
}

const APPOINTMENT_SELECT = `
  select a.id, to_char(a.date, 'YYYY-MM-DD') as date_iso, a.window_start,
         a.address, a.observation, a.confirmed_by_client,
         so.sa_id, so.sa_number, c.name as customer_name, c.phone as customer_phone, c.city
    from appointments a
    join case_records cr on cr.id = a.case_id
    join service_orders so on so.id = cr.service_order_id
    join customers c on c.id = so.customer_id`;

async function claimAndSend(pool, row) {
  const { rowCount } = await pool.query(
    `insert into whatsapp_dispatch_log (appointment_id, recipient_wa_id)
     values ($1, $2)
     on conflict (appointment_id) do nothing`,
    [row.id, CONTROL_WA_ID]
  );
  if (!rowCount) return false;

  try {
    const response = await sendText(CONTROL_WA_ID, formatAppointment(row));
    if (!response.ok) throw new Error(`WhatsApp respondeu HTTP ${response.status}`);
    await pool.query(
      `update whatsapp_dispatch_log set sent_at = now()
       where appointment_id = $1 and recipient_wa_id = $2`,
      [row.id, CONTROL_WA_ID]
    );
    return true;
  } catch (error) {
    await pool.query(
      `delete from whatsapp_dispatch_log
       where appointment_id = $1 and recipient_wa_id = $2 and sent_at is null`,
      [row.id, CONTROL_WA_ID]
    );
    console.error('[dispatch-control] falha ao enviar agendamento:', error.message);
    return false;
  }
}

async function sendPendingToday() {
  const pool = getPool();
  await ensureDispatchLog(pool);
  const { rows } = await pool.query(
    `${APPOINTMENT_SELECT}
      left join whatsapp_dispatch_log dl on dl.appointment_id = a.id
     where a.date = (now() at time zone 'America/Sao_Paulo')::date
       and a.confirmed_by_client = true
       and dl.appointment_id is null
     order by c.city, a.created_at, a.id`
  );

  let sent = 0;
  for (const row of rows) {
    if (await claimAndSend(pool, row)) sent += 1;
  }
  return { pending: rows.length, sent };
}

async function notifyTodayAppointmentForCustomer(waId) {
  const pool = getPool();
  await ensureDispatchLog(pool);
  const { rows } = await pool.query(
    `${APPOINTMENT_SELECT}
      left join whatsapp_dispatch_log dl on dl.appointment_id = a.id
     where c.phone = $1
       and a.date = (now() at time zone 'America/Sao_Paulo')::date
       and a.confirmed_by_client = true
       and dl.appointment_id is null
     order by a.updated_at desc
     limit 1`,
    [waId]
  );
  if (rows[0]) await claimAndSend(pool, rows[0]);
}

async function sendTotals() {
  const pool = getPool();
  const { rows } = await pool.query(
    `select c.city, count(*)::int as total
       from appointments a
       join case_records cr on cr.id = a.case_id
       join service_orders so on so.id = cr.service_order_id
       join customers c on c.id = so.customer_id
      where a.date = (now() at time zone 'America/Sao_Paulo')::date
        and a.confirmed_by_client = true
      group by c.city
      order by c.city`
  );
  const total = rows.reduce((sum, row) => sum + Number(row.total), 0);
  const details = rows.length
    ? rows.map((row) => `• ${row.city || 'Sem cidade'}: ${row.total}`).join('\n')
    : '• Nenhum agendamento';
  await sendText(
    CONTROL_WA_ID,
    `Agendamentos confirmados de hoje\n\nTotal: ${total}\n\nPor cidade:\n${details}`
  );
}

async function sendMenu() {
  await sendButtons(CONTROL_WA_ID, 'Controle dos agendamentos de hoje', MENU_BUTTONS);
}

async function handleDispatchControl({ msg }) {
  const input = extractInput(msg);
  if (input.kind === 'interactive' && input.id === 'dispatch_start') {
    const result = await sendPendingToday();
    if (result.sent === 0) {
      await sendText(CONTROL_WA_ID, 'Não há novos agendamentos de hoje para enviar.');
    } else {
      await sendText(CONTROL_WA_ID, `${result.sent} novo(s) agendamento(s) enviado(s), sem repetição.`);
    }
    await sendMenu();
    return;
  }
  if (input.kind === 'interactive' && input.id === 'dispatch_totals') {
    await sendTotals();
    await sendMenu();
    return;
  }
  await sendMenu();
}

module.exports = {
  CONTROL_WA_ID,
  handleDispatchControl,
  notifyTodayAppointmentForCustomer,
  sendPendingToday,
};
