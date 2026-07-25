// Fluxo do motoboy pelo próprio WhatsApp: ver o roteiro do dia, avançar
// parada por parada, avisar o cliente que está a caminho, marcar retirado
// (com foto+MAC do equipamento) ou cliente ausente/outro motivo (com
// observação), e conseguir ficar off quando surgir um imprevisto — sem
// depender do time de operação. Mesmo padrão CommonJS + pg cru de
// lib/new-schema-sync.js / lib/motoboy-routing.js.
const { getPool, getConversationState, setConversationState, clearConversationState } = require('./db');
const { sendText, sendButtons, sendList } = require('./whatsapp');
const { extractMacFromImage } = require('./mac-vision');
const { goOffline, goOnline } = require('./motoboy-routing');

const OTHER_REASONS = [
  { id: 'mb_reason_endereco', reason: 'endereco_incorreto', title: 'Endereço incorreto' },
  { id: 'mb_reason_recusou', reason: 'cliente_recusou', title: 'Cliente recusou' },
  { id: 'mb_reason_equipamento', reason: 'equipamento_nao_localizado', title: 'Equip. não achado' },
  { id: 'mb_reason_risco', reason: 'regiao_de_risco', title: 'Região de risco' },
  { id: 'mb_reason_veiculo', reason: 'problema_veiculo', title: 'Problema no veículo' },
  { id: 'mb_reason_outros', reason: 'outros', title: 'Outro motivo' },
];

const STOP_ACTION_BUTTONS = [
  { id: 'mb_retirado', title: 'Retirado' },
  { id: 'mb_ausente', title: 'Cliente ausente' },
  { id: 'mb_outro', title: 'Outro problema' },
];

const MENU_BUTTONS = [
  { id: 'mb_ver_rota', title: 'Ver rota de hoje' },
  { id: 'mb_ficar_off', title: 'Ficar off' },
];

function extractInput(msg) {
  if (msg.type === 'text') {
    return { kind: 'text', value: (msg.text?.body || '').trim() };
  }
  if (msg.type === 'image') {
    return { kind: 'image', mediaId: msg.image?.id };
  }
  if (msg.type === 'interactive') {
    const interactive = msg.interactive || {};
    if (interactive.type === 'button_reply') return { kind: 'interactive', id: interactive.button_reply.id };
    if (interactive.type === 'list_reply') return { kind: 'interactive', id: interactive.list_reply.id };
  }
  return { kind: 'unknown' };
}

// Mapeia o motivo da não realização pro status do caso — mesma regra de
// app/api/pickups/[caseId]/route.ts (só existem 3 status de destino).
function statusForReason(reason) {
  if (reason === 'cliente_ausente') return 'CLIENTE_AUSENTE';
  if (reason === 'endereco_incorreto' || reason === 'equipamento_nao_localizado') return 'ENDERECO_NAO_LOCALIZADO';
  return 'RETIRADA_NAO_REALIZADA';
}

async function transitionStatus(pool, caseId, toStatus, reason) {
  const { rows } = await pool.query(`select status from case_records where id = $1`, [caseId]);
  const fromStatus = rows[0]?.status;
  if (!fromStatus || fromStatus === toStatus) return;
  await pool.query(`update case_records set status = $2, updated_at = now() where id = $1`, [caseId, toStatus]);
  await pool.query(
    `insert into case_status_history (id, case_id, from_status, to_status, origin, reason, created_at)
     values (gen_random_uuid(), $1, $2, $3, 'BOT', $4, now())`,
    [caseId, fromStatus, toStatus, reason]
  );
}

async function getCurrentStop(pool, courierId) {
  const { rows } = await pool.query(
    `select r.id as route_id, rs.id as stop_id, rs.stop_order, rs.case_id, cr.status as case_status,
            so.sa_id, c.name as customer_name, c.phone as customer_phone,
            a.address, a.observation,
            (select count(*) from route_stops rs2 where rs2.route_id = r.id) as total_stops,
            (select count(*) from route_stops rs2 where rs2.route_id = r.id and rs2.status in ('CONCLUIDA', 'NAO_REALIZADA')) as resolved_stops
     from routes r
     join route_stops rs on rs.route_id = r.id
     join case_records cr on cr.id = rs.case_id
     join service_orders so on so.id = cr.service_order_id
     join customers c on c.id = so.customer_id
     left join appointments a on a.case_id = cr.id
     where r.courier_id = $1 and r.date = current_date
       and r.status in ('PLANEJADA', 'EM_ANDAMENTO')
       and rs.status not in ('CONCLUIDA', 'NAO_REALIZADA')
     order by rs.stop_order asc
     limit 1`,
    [courierId]
  );
  return rows[0] || null;
}

function formatStopMessage(stop) {
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.address || '')}`;
  return (
    `📍 Parada ${stop.stop_order} (${stop.resolved_stops}/${stop.total_stops} concluídas)\n\n` +
    `SA: ${stop.sa_id}\n` +
    `Cliente: ${stop.customer_name}\n` +
    `Telefone: ${stop.customer_phone}\n` +
    `Endereço: ${stop.address || 'Não informado'}\n` +
    `Observação: ${stop.observation?.trim() || 'Nenhuma'}\n` +
    `Mapa: ${mapUrl}`
  );
}

async function sendCurrentStopOrFinish(waId, pool, courierId) {
  const stop = await getCurrentStop(pool, courierId);
  if (!stop) {
    await sendText(waId, 'Você não tem paradas pendentes hoje 🎉');
    await clearConversationState(waId);
    return;
  }

  await pool.query(`update route_stops set status = 'EM_ANDAMENTO' where id = $1 and status = 'PENDENTE'`, [stop.stop_id]);

  await sendButtons(waId, formatStopMessage(stop), [{ id: 'mb_a_caminho', title: 'A caminho' }]);
  await setConversationState(waId, 'MB_VIEWING_STOP', {
    routeId: stop.route_id,
    stopId: stop.stop_id,
    caseId: stop.case_id,
    customerPhone: stop.customer_phone,
    enRoute: false,
  });
}

async function resolveStopAndAdvance(waId, pool, stopCtx, outcome, reason, note, equipment) {
  const { routeId, stopId, caseId } = stopCtx;
  const stopStatus = outcome === 'retirado' ? 'CONCLUIDA' : 'NAO_REALIZADA';
  await pool.query(`update route_stops set status = $2 where id = $1`, [stopId, stopStatus]);

  const { rows: routeRows } = await pool.query(`select courier_id from routes where id = $1`, [routeId]);
  const courierId = routeRows[0]?.courier_id || null;

  const { rows: pickupRows } = await pool.query(
    `insert into pickups (id, case_id, courier_id, performed_at, result, observation, created_at)
     values (gen_random_uuid(), $1, $2, now(), $3, $4, now())
     on conflict (case_id) do update set courier_id = excluded.courier_id, performed_at = now(), result = excluded.result, observation = excluded.observation
     returning id`,
    [caseId, courierId, outcome, note || null]
  );
  const pickupId = pickupRows[0].id;

  if (outcome === 'retirado') {
    if (equipment?.mac) {
      await pool.query(
        `insert into pickup_equipment (id, pickup_id, type, mac_address, photo_url, observation)
         values (gen_random_uuid(), $1, 'OUTROS', $2, $3, 'Registrado via WhatsApp (motoboy) — tipo não especificado')`,
        [pickupId, equipment.mac, equipment.photoUrl || null]
      );
    }
    if (equipment?.photoUrl) {
      await pool.query(
        `insert into pickup_proofs (id, pickup_id, file_url, kind, created_at)
         values (gen_random_uuid(), $1, $2, 'foto', now())`,
        [pickupId, equipment.photoUrl]
      );
    }
    // Se tem equipamento rastreado (MAC), a baixa fica travada esperando
    // devolução física até ser bipada na base (ver
    // app/api/equipment/checkin/route.ts) — sem equipamento, segue direto
    // pro padrão AGUARDANDO.
    const closureStatus = equipment?.mac ? 'AGUARDANDO_DEVOLUCAO' : 'AGUARDANDO';
    await pool.query(
      `insert into system_closures (id, pickup_id, status, created_at, updated_at)
       values (gen_random_uuid(), $1, $2, now(), now())
       on conflict (pickup_id) do nothing`,
      [pickupId, closureStatus]
    );
    await transitionStatus(pool, caseId, 'EQUIPAMENTO_RETIRADO', 'Retirada registrada via motoboy (WhatsApp)');
    await transitionStatus(pool, caseId, 'AGUARDANDO_BAIXA', 'Retirada concluída — aguardando baixa no sistema externo');
  } else {
    await pool.query(
      `insert into pickup_attempts (id, pickup_id, reason, note, created_at)
       values (gen_random_uuid(), $1, $2, $3, now())`,
      [pickupId, reason, note || null]
    );
    await transitionStatus(pool, caseId, statusForReason(reason), `Retirada não realizada via motoboy: ${reason}`);
  }

  const { rows: remaining } = await pool.query(
    `select count(*) as n from route_stops where route_id = $1 and status not in ('CONCLUIDA', 'NAO_REALIZADA')`,
    [routeId]
  );
  if (Number(remaining[0].n) === 0) {
    await pool.query(`update routes set status = 'CONCLUIDA', updated_at = now() where id = $1`, [routeId]);
  } else {
    await pool.query(
      `update routes set status = 'EM_ANDAMENTO', updated_at = now() where id = $1 and status = 'PLANEJADA'`,
      [routeId]
    );
  }
}

async function askOtherReason(waId) {
  await sendList(waId, 'Qual foi o problema?', 'Ver motivos', [
    { title: 'Motivo', rows: OTHER_REASONS.map((r) => ({ id: r.id, title: r.title })) },
  ]);
}

async function askStopActions(waId) {
  await sendButtons(waId, 'Escolhe uma opção pra essa parada:', STOP_ACTION_BUTTONS);
}

// Pergunta pro cliente se ele está em casa antes do motoboy sair — evita
// viagem perdida. Cross-conversa: grava estado no telefone do CLIENTE, não
// no do motoboy (mesma tabela conversation_states, chaves diferentes).
async function askCustomerIfHome(customerPhone, motoboyWaId, caseId) {
  await sendButtons(customerPhone, 'O motoboy está a caminho pra retirada do equipamento. Você se encontra em casa?', [
    { id: 'home_yes', title: 'Sim, estou' },
    { id: 'home_no', title: 'Não estou' },
  ]);
  await setConversationState(customerPhone, 'AWAITING_HOME_CONFIRM', { caseId, motoboyPhone: motoboyWaId });
}

// Cliente confirmou que NÃO está em casa (via lib/conversation.js, resposta
// à pergunta do botão "A caminho") — em vez de só avisar o motoboy e deixar
// ele decidir, já resolve a parada como cliente ausente sozinho e mostra a
// próxima parada pra ele, pra não dar viagem perdida de verdade.
async function handleCustomerNotHome(caseId, motoboyPhone) {
  const pool = getPool();
  const { rows } = await pool.query(
    `select rs.id as stop_id, rs.route_id, r.courier_id
     from route_stops rs
     join routes r on r.id = rs.route_id
     where rs.case_id = $1 and rs.status not in ('CONCLUIDA', 'NAO_REALIZADA')
     limit 1`,
    [caseId]
  );
  const stop = rows[0];
  if (!stop) return; // não achou parada pendente pra esse caso (já resolvida antes)

  await resolveStopAndAdvance(
    motoboyPhone,
    pool,
    { routeId: stop.route_id, stopId: stop.stop_id, caseId },
    'nao_realizada',
    'cliente_ausente',
    'Cliente confirmou pelo WhatsApp que não está em casa'
  );
  await sendText(
    motoboyPhone,
    '⚠️ Cliente confirmou que NÃO está em casa — já marquei como ausente e pulei pra próxima parada, pra você não perder a viagem.'
  );
  await sendCurrentStopOrFinish(motoboyPhone, pool, stop.courier_id);
}

async function handleMotoboyConversation({ waId, msg, courier }) {
  const input = extractInput(msg);
  const pool = getPool();

  // Ficar off/voltar disponível funciona em qualquer estado — imprevisto
  // pode surgir no meio de uma parada.
  if (input.kind === 'text') {
    if (/^off$/i.test(input.value)) {
      await goOffline(waId, courier);
      return;
    }
    if (/^(on|voltar|dispon[ií]vel)$/i.test(input.value)) {
      await goOnline(waId, courier);
      return;
    }
  }

  const current = await getConversationState(waId);
  const state = current?.state || null;
  const data = current?.data || {};

  if (!state) {
    await sendButtons(waId, `Oi, ${courier.name}! 👋`, MENU_BUTTONS);
    await setConversationState(waId, 'MB_MENU', {});
    return;
  }

  if (state === 'MB_MENU') {
    if (input.kind === 'interactive' && input.id === 'mb_ver_rota') {
      await sendCurrentStopOrFinish(waId, pool, courier.id);
      return;
    }
    if (input.kind === 'interactive' && input.id === 'mb_ficar_off') {
      await goOffline(waId, courier);
      return;
    }
    await sendButtons(waId, 'Como posso ajudar?', MENU_BUTTONS);
    return;
  }

  if (state === 'MB_VIEWING_STOP') {
    if (input.kind !== 'interactive') {
      if (data.enRoute) {
        await askStopActions(waId);
      } else {
        await sendButtons(waId, 'Quando estiver indo pra essa parada, avisa:', [{ id: 'mb_a_caminho', title: 'A caminho' }]);
      }
      return;
    }

    if (input.id === 'mb_a_caminho' && !data.enRoute) {
      await transitionStatus(pool, data.caseId, 'EM_DESLOCAMENTO', 'Motoboy a caminho (WhatsApp)');
      try {
        await askCustomerIfHome(data.customerPhone, waId, data.caseId);
      } catch (err) {
        console.error('[motoboy-conversation] erro ao perguntar pro cliente se está em casa:', err.message);
      }
      await sendText(waId, 'Perguntei pro cliente se ele está em casa — te aviso quando ele responder.');
      await setConversationState(waId, 'MB_VIEWING_STOP', { ...data, enRoute: true });
      await askStopActions(waId);
      return;
    }

    if (input.id === 'mb_retirado') {
      await sendText(waId, '📷 Manda uma foto da etiqueta do equipamento, bem legível, mostrando o MAC.');
      await setConversationState(waId, 'MB_AWAITING_EQUIPMENT_PHOTO', data);
      return;
    }
    if (input.id === 'mb_ausente') {
      await sendText(waId, 'Beleza. Quer registrar alguma observação? Se não, responde "não".');
      await setConversationState(waId, 'MB_AWAITING_AUSENTE_OBS', data);
      return;
    }
    if (input.id === 'mb_outro') {
      await askOtherReason(waId);
      await setConversationState(waId, 'MB_AWAITING_REASON', data);
      return;
    }
    if (data.enRoute) {
      await askStopActions(waId);
    } else {
      await sendButtons(waId, 'Quando estiver indo pra essa parada, avisa:', [{ id: 'mb_a_caminho', title: 'A caminho' }]);
    }
    return;
  }

  if (state === 'MB_AWAITING_EQUIPMENT_PHOTO') {
    if (input.kind !== 'image') {
      await sendText(waId, 'Preciso de uma foto da etiqueta do equipamento, mostrando o MAC.');
      return;
    }
    let result;
    try {
      result = await extractMacFromImage(input.mediaId);
    } catch (err) {
      console.error('[motoboy-conversation] erro ao processar foto do equipamento:', err.message);
      await sendText(waId, 'Não consegui processar essa foto. Pode mandar de novo?');
      return;
    }
    if (!result.mac) {
      await sendText(waId, 'Não consegui identificar o MAC nessa foto. Manda de novo, bem de perto e com boa luz.');
      return;
    }
    const mockNote = result.mocked ? ' ⚠️ (simulado — configure a ANTHROPIC_API_KEY pra leitura real)' : '';
    await sendButtons(waId, `MAC identificado: ${result.mac}${mockNote}\n\nConfirma que está correto?`, [
      { id: 'mb_mac_sim', title: 'Sim' },
      { id: 'mb_mac_nao', title: 'Não' },
    ]);
    await setConversationState(waId, 'MB_CONFIRM_MAC', { ...data, mac: result.mac, photoUrl: result.mediaUrl });
    return;
  }

  if (state === 'MB_CONFIRM_MAC') {
    if (input.kind !== 'interactive') {
      await sendText(waId, 'Confirma que o MAC identificado está correto? (Sim/Não)');
      return;
    }
    if (input.id === 'mb_mac_sim') {
      await resolveStopAndAdvance(waId, pool, data, 'retirado', null, null, { mac: data.mac, photoUrl: data.photoUrl });
      await sendText(waId, 'Retirada confirmada! ✅');
      await sendCurrentStopOrFinish(waId, pool, courier.id);
      return;
    }
    if (input.id === 'mb_mac_nao') {
      await sendText(waId, '📷 Manda a foto de novo, bem legível, mostrando o MAC.');
      await setConversationState(waId, 'MB_AWAITING_EQUIPMENT_PHOTO', data);
      return;
    }
    await sendText(waId, 'Confirma que o MAC identificado está correto? (Sim/Não)');
    return;
  }

  if (state === 'MB_AWAITING_AUSENTE_OBS') {
    if (input.kind !== 'text' || !input.value.trim()) {
      await sendText(waId, 'Quer registrar alguma observação? Se não, responde "não".');
      return;
    }
    const note = /^n[aã]o$/i.test(input.value.trim()) ? null : input.value.trim();
    await resolveStopAndAdvance(waId, pool, data, 'nao_realizada', 'cliente_ausente', note);
    await sendText(waId, 'Registrado: cliente ausente.');
    await sendCurrentStopOrFinish(waId, pool, courier.id);
    return;
  }

  if (state === 'MB_AWAITING_REASON') {
    if (input.kind !== 'interactive') {
      await askOtherReason(waId);
      return;
    }
    const chosen = OTHER_REASONS.find((r) => r.id === input.id);
    if (!chosen) {
      await askOtherReason(waId);
      return;
    }
    await sendText(waId, 'Quer registrar alguma observação? Se não, responde "não".');
    await setConversationState(waId, 'MB_AWAITING_REASON_OBS', { ...data, reason: chosen.reason });
    return;
  }

  if (state === 'MB_AWAITING_REASON_OBS') {
    if (input.kind !== 'text' || !input.value.trim()) {
      await sendText(waId, 'Quer registrar alguma observação? Se não, responde "não".');
      return;
    }
    const note = /^n[aã]o$/i.test(input.value.trim()) ? null : input.value.trim();
    await resolveStopAndAdvance(waId, pool, data, 'nao_realizada', data.reason, note);
    await sendText(waId, 'Registrado.');
    await sendCurrentStopOrFinish(waId, pool, courier.id);
    return;
  }

  // Estado desconhecido — reseta pro menu.
  await sendButtons(waId, `Oi, ${courier.name}! 👋`, MENU_BUTTONS);
  await setConversationState(waId, 'MB_MENU', {});
}

module.exports = { handleMotoboyConversation, handleCustomerNotHome };
