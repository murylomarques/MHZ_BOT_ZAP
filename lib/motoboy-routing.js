// Roteirização automática: quando um agendamento é confirmado de verdade
// pelo cliente, coloca o caso na rota do motoboy que atende aquela cidade,
// sem precisar do time de operação copiar/colar num grupo de WhatsApp.
// Mesmo padrão de lib/new-schema-sync.js: CommonJS, pg cru (sem Prisma),
// best-effort (nunca deve derrubar o fluxo do bot).
const { getPool } = require('./db');

// Status a partir dos quais o caso pode avançar pra ATRIBUIDO_MOTOBOY —
// espelha lib/server/status/transitions.ts (ALLOWED_TRANSITIONS), só que em
// SQL cru porque este arquivo é CommonJS fora do build do Next.
async function findActiveCourierByPhone(phone) {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `select id, name from couriers where phone = $1 and status = 'ATIVO' limit 1`,
      [phone]
    );
    return rows[0] || null;
  } catch (err) {
    console.error('[motoboy-routing] erro ao buscar motoboy por telefone:', err.message);
    return null;
  }
}

// Motoboy ativo que cobre a cidade, com menos paradas já atribuídas na data
// (desempate simples de carga — não considera daily_capacity ainda).
async function findBestCourierForCity(pool, city, dateIso) {
  const { rows } = await pool.query(
    `select c.id, c.name,
            coalesce(rs.stop_count, 0) as stop_count
     from couriers c
     join courier_coverage cc on cc.courier_id = c.id
     left join (
       select r.courier_id, count(rs2.id) as stop_count
       from routes r
       join route_stops rs2 on rs2.route_id = r.id
       where r.date = $2::date
       group by r.courier_id
     ) rs on rs.courier_id = c.id
     where c.status = 'ATIVO' and cc.city = $1
     order by stop_count asc, c.created_at asc
     limit 1`,
    [city, dateIso]
  );
  return rows[0] || null;
}

async function findOrCreateRoute(pool, courierId, dateIso) {
  const { rows: existing } = await pool.query(
    `select id from routes where courier_id = $1 and date = $2::date limit 1`,
    [courierId, dateIso]
  );
  if (existing.length) return existing[0].id;

  const { rows: created } = await pool.query(
    `insert into routes (id, courier_id, date, status, created_at, updated_at)
     values (gen_random_uuid(), $1, $2::date, 'PLANEJADA', now(), now())
     returning id`,
    [courierId, dateIso]
  );
  return created[0].id;
}

async function appendStopToRoute(pool, routeId, caseId) {
  const { rows } = await pool.query(
    `select coalesce(max(stop_order), 0) as max_order from route_stops where route_id = $1`,
    [routeId]
  );
  const nextOrder = Number(rows[0].max_order) + 1;
  await pool.query(
    `insert into route_stops (id, route_id, case_id, stop_order, status)
     values (gen_random_uuid(), $1, $2, $3, 'PENDENTE')
     on conflict (route_id, case_id) do nothing`,
    [routeId, caseId, nextOrder]
  );
}

// Avança AGENDADO -> AGUARDANDO_ROTA -> ROTA_PLANEJADA -> ATRIBUIDO_MOTOBOY,
// pulando etapas já ultrapassadas (mesma guarda de app/api/routes/route.ts).
async function advanceToAssigned(pool, caseId, courierName) {
  const { rows } = await pool.query(`select status from case_records where id = $1`, [caseId]);
  let status = rows[0]?.status;
  if (!status) return;

  const steps = [
    { from: 'AGENDADO', to: 'AGUARDANDO_ROTA', reason: 'Roteirização automática' },
    { from: 'AGUARDANDO_ROTA', to: 'ROTA_PLANEJADA', reason: 'Roteirização automática' },
    { from: 'ROTA_PLANEJADA', to: 'ATRIBUIDO_MOTOBOY', reason: `Atribuído automaticamente ao motoboy ${courierName}` },
  ];

  for (const step of steps) {
    if (status !== step.from) continue;
    await pool.query(`update case_records set status = $2, updated_at = now() where id = $1`, [caseId, step.to]);
    await pool.query(
      `insert into case_status_history (id, case_id, from_status, to_status, origin, reason, created_at)
       values (gen_random_uuid(), $1, $2, $3, 'BOT', $4, now())`,
      [caseId, step.from, step.to, step.reason]
    );
    status = step.to;
  }
}

// Chamado só quando o agendamento é confirmado de verdade pelo cliente
// (confirmed_by_client = true) — agendamento parcial (endereço ainda não
// confirmado) não é roteirizado, pra não mandar motoboy num endereço errado.
async function autoAssignToRoute(caseId) {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `select cr.id as case_id, a.date, c.city
       from case_records cr
       join appointments a on a.case_id = cr.id
       join service_orders so on so.id = cr.service_order_id
       join customers c on c.id = so.customer_id
       where cr.id = $1 and a.confirmed_by_client = true`,
      [caseId]
    );
    const info = rows[0];
    if (!info) return; // sem agendamento confirmado ainda — nada a fazer

    const dateIso = info.date.toISOString().slice(0, 10);
    const courier = await findBestCourierForCity(pool, info.city, dateIso);
    if (!courier) return; // nenhum motoboy ativo cobre essa cidade — fica pendente (ver dashboard)

    const routeId = await findOrCreateRoute(pool, courier.id, dateIso);
    await appendStopToRoute(pool, routeId, caseId);
    await advanceToAssigned(pool, caseId, courier.name);
  } catch (err) {
    console.error('[motoboy-routing] erro ao roteirizar automaticamente:', err.message);
  }
}

module.exports = { findActiveCourierByPhone, autoAssignToRoute };
