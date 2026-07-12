const {
  getConversationState,
  setConversationState,
  clearConversationState,
  insertPickupRequest,
} = require('./db');
const { sendText, sendButtons, sendList } = require('./whatsapp');

const TIMEZONE = 'America/Sao_Paulo';

const GREETINGS = ['oi', 'ola', 'olá', 'bom dia', 'boa tarde', 'boa noite', 'menu', 'ei', 'oii'];

const PERIOD_DEFS = [
  { id: 'period_manha', key: 'manha', title: 'Manhã (08h-12h)', endHour: 12 },
  { id: 'period_tarde', key: 'tarde', title: 'Tarde (13h-18h)', endHour: 18 },
  { id: 'period_noite', key: 'noite', title: 'Noite (19h-22h)', endHour: 22 },
];

const PERIODS = Object.fromEntries(PERIOD_DEFS.map((p) => [p.id, p.title]));
const PERIOD_LABEL = { manha: 'manhã', tarde: 'tarde', noite: 'noite' };

const NOMINATIM_USER_AGENT = 'mhz-bot-zap/1.0 (murylo.marques@desktop.tec.br)';

function normalize(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

function isGreeting(text) {
  const n = normalize(text);
  return GREETINGS.some((g) => n === normalize(g)) || n.length <= 12;
}

// Retorna a data de hoje (YYYY-MM-DD) e a hora atual (decimal) no fuso de São Paulo.
function nowSaoPaulo() {
  const now = new Date();
  const dateIso = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(now);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour').value);
  const minute = Number(parts.find((p) => p.type === 'minute').value);
  return { dateIso, hourDecimal: hour + minute / 60 };
}

// Períodos ainda disponíveis para a data informada: se for hoje, remove os que já passaram.
function availablePeriodsForDate(iso) {
  const { dateIso, hourDecimal } = nowSaoPaulo();
  if (iso !== dateIso) return PERIOD_DEFS;
  return PERIOD_DEFS.filter((p) => hourDecimal < p.endHour);
}

function formatDateLabel(iso) {
  const label = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`));
  return label.replace('.', '');
}

// Gera as próximas `count` datas a partir de hoje (fuso de São Paulo), pulando hoje
// se todos os períodos do dia já tiverem passado.
function nextDates(count) {
  const { dateIso: todayIso } = nowSaoPaulo();
  const [y, m, d] = todayIso.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));

  const dates = [];
  let offset = 0;
  while (dates.length < count && offset < count + 3) {
    const dt = new Date(base);
    dt.setUTCDate(base.getUTCDate() + offset);
    const iso = dt.toISOString().slice(0, 10);
    if (availablePeriodsForDate(iso).length > 0) {
      dates.push({ iso, label: formatDateLabel(iso) });
    }
    offset++;
  }
  return dates;
}

function extractInput(msg) {
  if (msg.type === 'text') {
    return { kind: 'text', value: (msg.text?.body || '').trim() };
  }
  if (msg.type === 'interactive') {
    const interactive = msg.interactive || {};
    if (interactive.type === 'button_reply') {
      return { kind: 'interactive', id: interactive.button_reply.id };
    }
    if (interactive.type === 'list_reply') {
      return { kind: 'interactive', id: interactive.list_reply.id };
    }
  }
  if (msg.type === 'location') {
    const loc = msg.location || {};
    return {
      kind: 'location',
      latitude: loc.latitude,
      longitude: loc.longitude,
      name: loc.name || null,
      rawAddress: loc.address || null,
    };
  }
  return { kind: 'unknown' };
}

// Endereço digitado precisa parecer um endereço de verdade: texto suficiente
// e pelo menos um número (número da casa), pra não deixar passar qualquer coisa.
function isValidAddressText(text) {
  const trimmed = (text || '').trim();
  if (trimmed.length < 15) return false;
  if (!/\d/.test(trimmed)) return false;
  const words = trimmed.split(/[\s,]+/).filter(Boolean);
  return words.length >= 4;
}

async function reverseGeocode(latitude, longitude) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&addressdetails=1`;
    const res = await fetch(url, { headers: { 'User-Agent': NOMINATIM_USER_AGENT } });
    if (!res.ok) return null;
    const json = await res.json();
    return json.display_name || null;
  } catch (err) {
    console.error('Erro ao reverse-geocodificar localização:', err.message);
    return null;
  }
}

async function resolveLocationAddress(input) {
  if (input.rawAddress) return input.rawAddress;
  const geocoded = await reverseGeocode(input.latitude, input.longitude);
  if (geocoded) return geocoded;
  return `Localização compartilhada: https://maps.google.com/?q=${input.latitude},${input.longitude}`;
}

async function sendMainMenu(waId) {
  await sendButtons(waId, 'Como posso te ajudar hoje?', [
    { id: 'menu_internet', title: 'Contratar internet' },
    { id: 'menu_pickup', title: 'Retirar equipamento' },
  ]);
}

async function askDate(waId) {
  const dates = nextDates(4);
  await sendList(waId, 'Para qual dia você quer agendar a retirada do equipamento?', 'Escolher data', [
    {
      title: 'Datas disponíveis',
      rows: dates.map((d) => ({ id: `date_${d.iso}`, title: d.label })),
    },
  ]);
  return dates;
}

async function askPeriod(waId, periods) {
  await sendButtons(
    waId,
    'Qual o melhor período?',
    periods.map((p) => ({ id: p.id, title: p.title }))
  );
}

async function askAddress(waId) {
  await sendText(
    waId,
    'Pode me confirmar o endereço completo (rua, número, bairro e cidade) onde o equipamento deve ser retirado?\n\n' +
      'Se preferir, você também pode compartilhar sua localização atual pelo WhatsApp (📎 → Localização).'
  );
}

async function askAddressNumber(waId) {
  await sendText(
    waId,
    'Recebi sua localização 📍! Só preciso do número da casa/apartamento e complemento (se houver) pra ficar completo.'
  );
}

async function askPhone(waId) {
  await sendText(waId, 'Show! Agora me passa um telefone alternativo para contato, por favor.');
}

async function askConfirmation(waId, data) {
  const summary =
    `Confere os dados do agendamento:\n\n` +
    `📅 Data: ${data.pickupDateLabel}\n` +
    `🕐 Período: ${PERIODS[`period_${data.period}`] || data.period}\n` +
    `📍 Endereço: ${data.address}\n` +
    `📞 Telefone alternativo: ${data.contactPhone}\n\n` +
    `Está tudo certo?`;

  await sendButtons(waId, summary, [
    { id: 'confirm_yes', title: 'Confirmar' },
    { id: 'confirm_no', title: 'Corrigir dados' },
  ]);
}

async function handleConversation({ waId, contactId, msg, profileName }) {
  const input = extractInput(msg);
  const current = await getConversationState(waId);
  const state = current?.state || null;
  const data = current?.data || {};

  // Sem estado ativo: só reage a algo parecido com saudação/menu; ignora o resto.
  if (!state) {
    if (input.kind === 'text' && !isGreeting(input.value)) return;
    const greeting = profileName ? `Olá, ${profileName}! 👋 Seja bem-vindo(a).` : 'Olá! 👋 Seja bem-vindo(a).';
    await sendText(waId, greeting);
    await sendMainMenu(waId);
    await setConversationState(waId, 'AWAITING_MENU', {});
    return;
  }

  if (state === 'AWAITING_MENU') {
    if (input.kind !== 'interactive') {
      await sendMainMenu(waId);
      return;
    }
    if (input.id === 'menu_internet') {
      await sendText(
        waId,
        'Perfeito! Um dos nossos consultores vai te chamar por aqui para falar sobre planos de internet. 📶'
      );
      await clearConversationState(waId);
      return;
    }
    if (input.id === 'menu_pickup') {
      await askDate(waId);
      await setConversationState(waId, 'AWAITING_DATE', {});
      return;
    }
    await sendMainMenu(waId);
    return;
  }

  if (state === 'AWAITING_DATE') {
    if (input.kind !== 'interactive' || !input.id.startsWith('date_')) {
      await askDate(waId);
      return;
    }
    const iso = input.id.replace('date_', '');
    const periods = availablePeriodsForDate(iso);
    if (!periods.length) {
      // A data escolhida não tem mais períodos livres (ex: usuário demorou pra responder e o dia virou).
      await sendText(waId, 'Essa data não tem mais horários disponíveis. Escolhe outra data, por favor.');
      await askDate(waId);
      await setConversationState(waId, 'AWAITING_DATE', {});
      return;
    }

    await askPeriod(waId, periods);
    await setConversationState(waId, 'AWAITING_PERIOD', {
      ...data,
      pickupDate: iso,
      pickupDateLabel: formatDateLabel(iso),
      availablePeriodIds: periods.map((p) => p.id),
    });
    return;
  }

  if (state === 'AWAITING_PERIOD') {
    const allowedIds = data.availablePeriodIds || PERIOD_DEFS.map((p) => p.id);
    if (input.kind !== 'interactive' || !allowedIds.includes(input.id)) {
      await askPeriod(waId, PERIOD_DEFS.filter((p) => allowedIds.includes(p.id)));
      return;
    }
    const period = input.id.replace('period_', '');
    await askAddress(waId);
    await setConversationState(waId, 'AWAITING_ADDRESS', { ...data, period });
    return;
  }

  if (state === 'AWAITING_ADDRESS') {
    if (input.kind === 'location') {
      const address = await resolveLocationAddress(input);
      await askAddressNumber(waId);
      await setConversationState(waId, 'AWAITING_ADDRESS_NUMBER', { ...data, address });
      return;
    }
    if (input.kind !== 'text' || !isValidAddressText(input.value)) {
      await sendText(
        waId,
        'Não consegui entender o endereço. Preciso de rua, número, bairro e cidade (ex: "Rua das Flores, 123, Centro, Campinas") ' +
          'ou você pode compartilhar sua localização pelo WhatsApp (📎 → Localização).'
      );
      return;
    }
    await askPhone(waId);
    await setConversationState(waId, 'AWAITING_PHONE', { ...data, address: input.value });
    return;
  }

  if (state === 'AWAITING_ADDRESS_NUMBER') {
    if (input.kind !== 'text' || !input.value.trim()) {
      await askAddressNumber(waId);
      return;
    }
    const address = `${data.address} - nº ${input.value.trim()}`;
    await askPhone(waId);
    await setConversationState(waId, 'AWAITING_PHONE', { ...data, address });
    return;
  }

  if (state === 'AWAITING_PHONE') {
    const digits = input.kind === 'text' ? input.value.replace(/\D/g, '') : '';
    if (digits.length < 10) {
      await sendText(waId, 'Esse telefone parece inválido. Pode me enviar novamente com DDD?');
      return;
    }
    const updated = { ...data, contactPhone: input.value };
    await askConfirmation(waId, updated);
    await setConversationState(waId, 'AWAITING_CONFIRM', updated);
    return;
  }

  if (state === 'AWAITING_CONFIRM') {
    if (input.kind !== 'interactive') {
      await askConfirmation(waId, data);
      return;
    }
    if (input.id === 'confirm_yes') {
      await insertPickupRequest({
        contactId,
        waId,
        pickupDate: data.pickupDate,
        period: data.period,
        address: data.address,
        contactPhone: data.contactPhone,
      });
      await sendText(
        waId,
        `Retirada agendada com sucesso! ✅\n\nNossa equipe vai até o endereço informado em ${data.pickupDateLabel}, no período da ${
          PERIOD_LABEL[data.period] || data.period
        }.`
      );
      await clearConversationState(waId);
      return;
    }
    if (input.id === 'confirm_no') {
      await sendText(waId, 'Sem problemas, vamos refazer o agendamento.');
      await askDate(waId);
      await setConversationState(waId, 'AWAITING_DATE', {});
      return;
    }
    await askConfirmation(waId, data);
  }
}

module.exports = { handleConversation };
