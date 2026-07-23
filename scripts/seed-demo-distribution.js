// Distribui uma amostra dos casos importados pelas várias etapas do fluxo
// (agendado, rota, retirado, baixa, etc.) só para fins de demonstração —
// não mexe nas tabelas legadas do bot. Idempotente o suficiente para não
// duplicar se rodado de novo (marca em case_status_history uma origem
// "SEED_DEMO" implícita via reason).
require('dotenv').config();
const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({
  connectionString: process.env.DIRECT_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  keepAlive: true,
});
pool.on('error', (err) => console.error('pool error (ignorado, retry no próximo comando):', err.message));

function uuid() {
  return crypto.randomUUID();
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function insertHistory(client, caseId, from, to, origin, reason) {
  await client.query(
    `insert into case_status_history (id, case_id, from_status, to_status, origin, reason, created_at)
     values ($1,$2,$3,$4,$5,$6, now() - (random() * interval '5 days'))`,
    [uuid(), caseId, from, to, origin, reason]
  );
}

async function setStatus(client, caseId, status) {
  await client.query(`update case_records set status = $2, updated_at = now() where id = $1`, [caseId, status]);
}

async function main() {
  const client = await pool.connect();
  try {
    const { rows: cases } = await client.query(`
      select cr.id as case_id, cr.status, so.id as service_order_id, c.id as customer_id, c.city,
             ca.full_address, ca.latitude, ca.longitude
      from case_records cr
      join service_orders so on so.id = cr.service_order_id
      join customers c on c.id = so.customer_id
      left join customer_addresses ca on ca.customer_id = c.id
      where cr.status in ('PENDENTE_DISPARO','MENSAGEM_ENVIADA')
      order by random()
    `);
    console.log('total elegível:', cases.length);

    // garante 3 motoboys de demonstração
    const courierNames = ['Motoboy Demo 1', 'Motoboy Demo 2', 'Motoboy Demo 3'];
    const courierIds = [];
    for (const name of courierNames) {
      const { rows } = await client.query(
        `insert into couriers (id, name, phone, status, vehicle_type, daily_capacity, created_at, updated_at)
         values ($1,$2,$3,'ATIVO','moto',20, now(), now())
         on conflict (id) do nothing
         returning id`,
        [uuid(), name, '55119' + randInt(10000000, 99999999)]
      );
      const { rows: existing } = await client.query(`select id from couriers where name = $1`, [name]);
      courierIds.push((rows[0] || existing[0]).id);
    }

    let cursor = 0;
    function takeSlice(n) {
      const slice = cases.slice(cursor, cursor + n);
      cursor += n;
      return slice;
    }

    const total = cases.length;
    const nAguardandoResposta = Math.round(total * 0.05);
    const nEnderecoConfirmado = Math.round(total * 0.03);
    const nAgendado = Math.round(total * 0.03);
    const nRotaMotoboy = Math.round(total * 0.015);
    const nEmDeslocamento = Math.round(total * 0.01);
    const nAguardandoBaixa = Math.round(total * 0.01);
    const nFinalizado = Math.round(total * 0.004);
    const nNaoRealizada = Math.round(total * 0.003);

    // 1) Aguardando resposta (mensagem entregue/lida, sem resposta ainda)
    for (const c of takeSlice(nAguardandoResposta)) {
      await insertHistory(client, c.case_id, c.status, 'MENSAGEM_ENTREGUE', 'INTEGRACAO', 'Confirmação de entrega (demo)');
      await insertHistory(client, c.case_id, 'MENSAGEM_ENTREGUE', 'AGUARDANDO_RESPOSTA', 'BOT', 'Aguardando resposta (demo)');
      await setStatus(client, c.case_id, 'AGUARDANDO_RESPOSTA');
    }
    console.log('aguardando resposta:', nAguardandoResposta);

    // 2) Cliente respondeu + endereço confirmado -> aguardando agendamento
    const enderecoConfirmadoCases = takeSlice(nEnderecoConfirmado);
    for (const c of enderecoConfirmadoCases) {
      await insertHistory(client, c.case_id, c.status, 'AGUARDANDO_RESPOSTA', 'BOT', 'Mensagem entregue (demo)');
      await insertHistory(client, c.case_id, 'AGUARDANDO_RESPOSTA', 'CLIENTE_RESPONDEU', 'BOT', 'Cliente respondeu (demo)');
      await insertHistory(client, c.case_id, 'CLIENTE_RESPONDEU', 'ENDERECO_CONFIRMADO', 'BOT', 'Endereço confirmado (demo)');
      await insertHistory(client, c.case_id, 'ENDERECO_CONFIRMADO', 'AGUARDANDO_AGENDAMENTO', 'ATENDENTE', 'Aguardando agendamento (demo)');
      await setStatus(client, c.case_id, 'AGUARDANDO_AGENDAMENTO');
    }
    console.log('endereço confirmado / aguardando agendamento:', nEnderecoConfirmado);

    // 3) Agendado (com Appointment real)
    const agendadoCases = takeSlice(nAgendado);
    for (const c of agendadoCases) {
      await insertHistory(client, c.case_id, c.status, 'AGUARDANDO_RESPOSTA', 'BOT', 'Mensagem entregue (demo)');
      await insertHistory(client, c.case_id, 'AGUARDANDO_RESPOSTA', 'CLIENTE_RESPONDEU', 'BOT', 'Cliente respondeu (demo)');
      await insertHistory(client, c.case_id, 'CLIENTE_RESPONDEU', 'ENDERECO_CONFIRMADO', 'BOT', 'Endereço confirmado (demo)');
      await insertHistory(client, c.case_id, 'ENDERECO_CONFIRMADO', 'AGUARDANDO_AGENDAMENTO', 'ATENDENTE', 'Aguardando agendamento (demo)');
      await insertHistory(client, c.case_id, 'AGUARDANDO_AGENDAMENTO', 'AGENDADO', 'GESTOR', 'Agendamento criado (demo)');
      await setStatus(client, c.case_id, 'AGENDADO');

      const daysAhead = randInt(1, 14);
      const windowStart = pick(['08:00', '10:00', '13:00', '15:00']);
      const windowEnd = pick(['10:00', '12:00', '15:00', '18:00']);
      await client.query(
        `insert into appointments (id, case_id, date, window_start, window_end, address, confirmed_by_client, created_at, updated_at)
         values ($1,$2, current_date + ($3 || ' days')::interval, $4, $5, $6, $7, now(), now())`,
        [uuid(), c.case_id, daysAhead, windowStart, windowEnd, c.full_address || `Endereço em ${c.city}`, Math.random() > 0.3]
      );
    }
    console.log('agendados (com appointment):', nAgendado);

    // 4) Rota planejada + motoboy atribuído (com Route/RouteStop reais)
    const rotaCases = takeSlice(nRotaMotoboy);
    const byCity = new Map();
    for (const c of rotaCases) {
      if (!byCity.has(c.city)) byCity.set(c.city, []);
      byCity.get(c.city).push(c);
    }
    for (const [city, group] of byCity) {
      const courierId = pick(courierIds);
      const routeId = uuid();
      await client.query(
        `insert into routes (id, courier_id, date, status, created_at, updated_at)
         values ($1,$2, current_date + (($3)||' days')::interval, 'PLANEJADA', now(), now())`,
        [routeId, courierId, randInt(1, 5)]
      );
      let order = 1;
      let cumDist = 0;
      for (const c of group) {
        for (const [from, to, origin, reason] of [
          [c.status, 'AGUARDANDO_RESPOSTA', 'BOT', 'Mensagem entregue (demo)'],
          ['AGUARDANDO_RESPOSTA', 'CLIENTE_RESPONDEU', 'BOT', 'Cliente respondeu (demo)'],
          ['CLIENTE_RESPONDEU', 'ENDERECO_CONFIRMADO', 'BOT', 'Endereço confirmado (demo)'],
          ['ENDERECO_CONFIRMADO', 'AGUARDANDO_AGENDAMENTO', 'ATENDENTE', 'Aguardando agendamento (demo)'],
          ['AGUARDANDO_AGENDAMENTO', 'AGENDADO', 'GESTOR', 'Agendamento criado (demo)'],
          ['AGENDADO', 'AGUARDANDO_ROTA', 'GESTOR', 'Aguardando rota (demo)'],
          ['AGUARDANDO_ROTA', 'ROTA_PLANEJADA', 'GESTOR', 'Rota planejada (demo)'],
          ['ROTA_PLANEJADA', 'ATRIBUIDO_MOTOBOY', 'GESTOR', 'Motoboy atribuído (demo)'],
        ]) {
          await insertHistory(client, c.case_id, from, to, origin, reason);
        }
        await setStatus(client, c.case_id, 'ATRIBUIDO_MOTOBOY');
        cumDist += Math.random() * 4 + 1;
        await client.query(
          `insert into route_stops (id, route_id, case_id, stop_order, estimated_distance_km, status)
           values ($1,$2,$3,$4,$5,'PENDENTE')`,
          [uuid(), routeId, c.case_id, order++, cumDist]
        );
      }
    }
    console.log('rota planejada + motoboy atribuído:', rotaCases.length);

    // 5) Em deslocamento
    const deslocCases = takeSlice(nEmDeslocamento);
    for (const c of deslocCases) {
      for (const [from, to, origin, reason] of [
        [c.status, 'AGUARDANDO_RESPOSTA', 'BOT', 'demo'],
        ['AGUARDANDO_RESPOSTA', 'CLIENTE_RESPONDEU', 'BOT', 'demo'],
        ['CLIENTE_RESPONDEU', 'ENDERECO_CONFIRMADO', 'BOT', 'demo'],
        ['ENDERECO_CONFIRMADO', 'AGUARDANDO_AGENDAMENTO', 'ATENDENTE', 'demo'],
        ['AGUARDANDO_AGENDAMENTO', 'AGENDADO', 'GESTOR', 'demo'],
        ['AGENDADO', 'AGUARDANDO_ROTA', 'GESTOR', 'demo'],
        ['AGUARDANDO_ROTA', 'ROTA_PLANEJADA', 'GESTOR', 'demo'],
        ['ROTA_PLANEJADA', 'ATRIBUIDO_MOTOBOY', 'GESTOR', 'demo'],
        ['ATRIBUIDO_MOTOBOY', 'EM_DESLOCAMENTO', 'GESTOR', 'Motoboy a caminho (demo)'],
      ]) {
        await insertHistory(client, c.case_id, from, to, origin, reason);
      }
      await setStatus(client, c.case_id, 'EM_DESLOCAMENTO');
    }
    console.log('em deslocamento:', nEmDeslocamento);

    // 6) Equipamento retirado -> aguardando baixa (com Pickup + Equipment + Closure)
    const baixaCases = takeSlice(nAguardandoBaixa);
    for (const c of baixaCases) {
      for (const [from, to] of [
        [c.status, 'AGUARDANDO_RESPOSTA'],
        ['AGUARDANDO_RESPOSTA', 'CLIENTE_RESPONDEU'],
        ['CLIENTE_RESPONDEU', 'ENDERECO_CONFIRMADO'],
        ['ENDERECO_CONFIRMADO', 'AGUARDANDO_AGENDAMENTO'],
        ['AGUARDANDO_AGENDAMENTO', 'AGENDADO'],
        ['AGENDADO', 'AGUARDANDO_ROTA'],
        ['AGUARDANDO_ROTA', 'ROTA_PLANEJADA'],
        ['ROTA_PLANEJADA', 'ATRIBUIDO_MOTOBOY'],
        ['ATRIBUIDO_MOTOBOY', 'EM_DESLOCAMENTO'],
        ['EM_DESLOCAMENTO', 'EQUIPAMENTO_RETIRADO'],
        ['EQUIPAMENTO_RETIRADO', 'AGUARDANDO_BAIXA'],
      ]) {
        await insertHistory(client, c.case_id, from, to, 'GESTOR', 'demo');
      }
      await setStatus(client, c.case_id, 'AGUARDANDO_BAIXA');

      const pickupId = uuid();
      await client.query(
        `insert into pickups (id, case_id, courier_id, performed_at, result, observation, created_at)
         values ($1,$2,$3, now() - (random()*interval '3 days'), 'retirado', 'Retirada de demonstração', now())`,
        [pickupId, c.case_id, pick(courierIds)]
      );
      await client.query(
        `insert into pickup_equipment (id, pickup_id, type, quantity, condition)
         values ($1,$2,$3,1,'bom')`,
        [uuid(), pickupId, pick(['ONU', 'ROTEADOR', 'MODEM', 'FONTE'])]
      );
      await client.query(
        `insert into system_closures (id, pickup_id, status, created_at, updated_at)
         values ($1,$2,'AGUARDANDO', now(), now())`,
        [uuid(), pickupId]
      );
    }
    console.log('aguardando baixa (com pickup+equipamento):', nAguardandoBaixa);

    // 7) Finalizado (baixa realizada)
    const finalizadoCases = takeSlice(nFinalizado);
    for (const c of finalizadoCases) {
      for (const [from, to] of [
        [c.status, 'AGUARDANDO_RESPOSTA'],
        ['AGUARDANDO_RESPOSTA', 'CLIENTE_RESPONDEU'],
        ['CLIENTE_RESPONDEU', 'ENDERECO_CONFIRMADO'],
        ['ENDERECO_CONFIRMADO', 'AGUARDANDO_AGENDAMENTO'],
        ['AGUARDANDO_AGENDAMENTO', 'AGENDADO'],
        ['AGENDADO', 'AGUARDANDO_ROTA'],
        ['AGUARDANDO_ROTA', 'ROTA_PLANEJADA'],
        ['ROTA_PLANEJADA', 'ATRIBUIDO_MOTOBOY'],
        ['ATRIBUIDO_MOTOBOY', 'EM_DESLOCAMENTO'],
        ['EM_DESLOCAMENTO', 'EQUIPAMENTO_RETIRADO'],
        ['EQUIPAMENTO_RETIRADO', 'AGUARDANDO_BAIXA'],
        ['AGUARDANDO_BAIXA', 'BAIXA_PROCESSANDO'],
        ['BAIXA_PROCESSANDO', 'BAIXA_REALIZADA'],
        ['BAIXA_REALIZADA', 'FINALIZADO'],
      ]) {
        await insertHistory(client, c.case_id, from, to, 'GESTOR', 'demo');
      }
      await setStatus(client, c.case_id, 'FINALIZADO');

      const pickupId = uuid();
      await client.query(
        `insert into pickups (id, case_id, courier_id, performed_at, result, observation, created_at)
         values ($1,$2,$3, now() - (random()*interval '10 days'), 'retirado', 'Retirada de demonstração', now())`,
        [pickupId, c.case_id, pick(courierIds)]
      );
      await client.query(
        `insert into pickup_equipment (id, pickup_id, type, quantity, condition)
         values ($1,$2,$3,1,'bom')`,
        [uuid(), pickupId, pick(['ONU', 'ROTEADOR'])]
      );
      await client.query(
        `insert into system_closures (id, pickup_id, status, closure_code, performed_at, created_at, updated_at)
         values ($1,$2,'REALIZADA',$3, now(), now(), now())`,
        [uuid(), pickupId, 'DEMO-' + randInt(1000, 9999)]
      );
    }
    console.log('finalizado (baixa realizada):', nFinalizado);

    // 8) Retirada não realizada / cliente ausente
    const naoRealizadaCases = takeSlice(nNaoRealizada);
    for (const c of naoRealizadaCases) {
      for (const [from, to] of [
        [c.status, 'AGUARDANDO_RESPOSTA'],
        ['AGUARDANDO_RESPOSTA', 'CLIENTE_RESPONDEU'],
        ['CLIENTE_RESPONDEU', 'ENDERECO_CONFIRMADO'],
        ['ENDERECO_CONFIRMADO', 'AGUARDANDO_AGENDAMENTO'],
        ['AGUARDANDO_AGENDAMENTO', 'AGENDADO'],
        ['AGENDADO', 'AGUARDANDO_ROTA'],
        ['AGUARDANDO_ROTA', 'ROTA_PLANEJADA'],
        ['ROTA_PLANEJADA', 'ATRIBUIDO_MOTOBOY'],
        ['ATRIBUIDO_MOTOBOY', 'EM_DESLOCAMENTO'],
        ['EM_DESLOCAMENTO', 'CLIENTE_AUSENTE'],
      ]) {
        await insertHistory(client, c.case_id, from, to, 'GESTOR', 'demo');
      }
      await setStatus(client, c.case_id, 'CLIENTE_AUSENTE');

      const pickupId = uuid();
      await client.query(
        `insert into pickups (id, case_id, courier_id, performed_at, result, observation, created_at)
         values ($1,$2,$3, now() - (random()*interval '2 days'), 'nao_realizada', 'Cliente ausente (demo)', now())`,
        [pickupId, c.case_id, pick(courierIds)]
      );
      await client.query(
        `insert into pickup_attempts (id, pickup_id, reason, note, created_at)
         values ($1,$2,'cliente_ausente','Ninguém atendeu no local (demo)', now())`,
        [uuid(), pickupId]
      );
    }
    console.log('retirada não realizada (cliente ausente):', naoRealizadaCases.length);

    console.log('--- RESUMO ---');
    const { rows: summary } = await client.query(
      `select status, count(*) from case_records group by status order by count(*) desc`
    );
    console.log(summary);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
