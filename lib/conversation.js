const {
  getConversationState,
  setConversationState,
  clearConversationState,
  insertPickupRequest,
  insertRetentionLead,
} = require('./db');
const { sendText, sendButtons, sendList } = require('./whatsapp');
const { syncPickupScheduled, syncRetentionLead, logFunnelStep, getKnownAddress } = require('./new-schema-sync');

const TIMEZONE = 'America/Sao_Paulo';
const BRAND = 'DESKTOP';

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
  if (msg.type === 'button') {
    return { kind: 'button', payload: msg.button?.payload || '', text: msg.button?.text || '' };
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

// Validações dos dados de retenção (cadastro de novo contrato) — sem isso,
// qualquer texto era aceito e avançava pro próximo campo, o que já causou
// dado torto (ex: "Ops 45" virando data de nascimento, e todo o resto dos
// campos saindo desalinhado a partir daí).
function isValidFullName(text) {
  const trimmed = (text || '').trim();
  if (trimmed.length < 5) return false;
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  return /^[A-Za-zÀ-ÖØ-öø-ÿ'’\-\s]+$/.test(trimmed);
}

function isValidCPF(text) {
  const digits = (text || '').replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(digits[i]) * (10 - i);
  let check1 = 11 - (sum % 11);
  if (check1 >= 10) check1 = 0;
  if (check1 !== Number(digits[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(digits[i]) * (11 - i);
  let check2 = 11 - (sum % 11);
  if (check2 >= 10) check2 = 0;
  return check2 === Number(digits[10]);
}

function isValidRG(text) {
  const cleaned = (text || '').replace(/[^0-9A-Za-z]/g, '');
  return cleaned.length >= 5 && cleaned.length <= 14;
}

function isValidBirthDate(text) {
  const match = (text || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return false;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12) return false;
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) return false;
  if (year < 1900 || year > new Date().getFullYear()) return false;
  return new Date(year, month - 1, day) <= new Date();
}

function isValidEmail(text) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((text || '').trim());
}

function isValidPhoneDigits(text) {
  return (text || '').replace(/\D/g, '').length >= 10;
}

const RETENTION_VALIDATORS = {
  nomeCompleto: isValidFullName,
  cpf: isValidCPF,
  rg: isValidRG,
  dataNascimento: isValidBirthDate,
  nomeMae: isValidFullName,
  email: isValidEmail,
  endereco: isValidAddressText,
  telefone1: isValidPhoneDigits,
  telefone2: isValidPhoneDigits,
};

const RETENTION_INVALID_MESSAGES = {
  nomeCompleto: 'Não consegui entender. Pode mandar o nome completo (nome e sobrenome)?',
  cpf: 'Esse CPF não parece válido. Confere e manda de novo, por favor (só números, com ou sem pontuação).',
  rg: 'Esse RG não parece válido. Confere e manda de novo, por favor.',
  dataNascimento: 'Não consegui entender a data. Manda no formato dd/mm/aaaa (ex: 25/03/1990).',
  nomeMae: 'Não consegui entender. Pode mandar o nome completo da mãe?',
  email: 'Esse e-mail não parece válido. Confere e manda de novo, por favor.',
  endereco: 'Não consegui entender o endereço. Preciso de rua, número, bairro e cidade (ex: "Rua das Flores, 123, Centro, Campinas").',
  telefone1: 'Esse telefone parece inválido. Pode mandar novamente com DDD?',
  telefone2: 'Esse telefone parece inválido. Pode mandar novamente com DDD, ou responde "não" se não tiver outro.',
};

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

async function askAddressConfirm(waId, knownAddress) {
  await sendButtons(waId, `O endereço para a retirada é esse?\n\n📍 ${knownAddress}`, [
    { id: 'address_yes', title: 'Sim, está certo' },
    { id: 'address_no', title: 'Não, quero corrigir' },
  ]);
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

async function askObservation(waId) {
  await sendText(
    waId,
    'Alguma observação sobre a retirada (ponto de referência, portão, melhor forma de acesso, etc.)? ' +
      'Se não tiver nenhuma, responde "não".'
  );
}

async function askConfirmation(waId, data) {
  const summary =
    `Confere os dados do agendamento:\n\n` +
    `📅 Data: ${data.pickupDateLabel}\n` +
    `🕐 Período: ${PERIODS[`period_${data.period}`] || data.period}\n` +
    `📍 Endereço: ${data.address}\n` +
    `📞 Telefone alternativo: ${data.contactPhone}\n` +
    (data.observacao ? `📝 Observação: ${data.observacao}\n` : '') +
    `\nEstá tudo certo?`;

  await sendButtons(waId, summary, [
    { id: 'confirm_yes', title: 'Confirmar' },
    { id: 'confirm_no', title: 'Corrigir dados' },
  ]);
}

const RETENTION_REASONS = [
  { id: 'reason_preco', title: 'Valor da mensalidade' },
  { id: 'reason_qualidade', title: 'Qualidade/velocidade' },
  { id: 'reason_mudanca', title: 'Mudança de endereço' },
  { id: 'reason_naousa', title: 'Não uso mais' },
  { id: 'reason_outro', title: 'Outro motivo' },
];

const RETENTION_PITCHES = {
  reason_preco:
    `Entendo, o bolso pesa mesmo 💰. Antes de encerrar, deixa eu tentar negociar um valor especial pra você continuar ` +
    `com a ${BRAND} — muitas vezes conseguimos um plano mais em conta sem cortar a qualidade.`,
  reason_qualidade:
    `Poxa, sinto muito pela experiência 😕. Consigo acionar o time técnico pra rever sua instalação e seu plano sem custo, ` +
    `antes de você desistir de vez da internet.`,
  reason_mudanca:
    `Se é mudança de endereço, não precisa cancelar! A ${BRAND} consegue transferir sua internet pro novo endereço, ` +
    `muitas vezes sem multa e sem ficar sem internet na mudança.`,
  reason_naousa:
    `Entendo, mas às vezes tem outra pessoa da casa (ou da família) que usaria — dá pra colocar o contrato no nome ` +
    `dela e manter os benefícios de cliente ativo, com condição especial.`,
  reason_outro:
    `Antes de encerrar, quero te fazer uma proposta 🙂. Conseguimos condições especiais pra você continuar com a ${BRAND} — ` +
    `inclusive dá pra fazer um novo contrato no nome de outra pessoa (um familiar, por exemplo), caso isso ajude.`,
};

async function askRetentionReason(waId) {
  await sendList(waId, 'Antes de seguir com a retirada, pode me contar o motivo? Assim consigo ver a melhor solução pra você.', 'Ver motivos', [
    { title: 'Motivo do cancelamento', rows: RETENTION_REASONS.map((r) => ({ id: r.id, title: r.title })) },
  ]);
}

async function askRetentionPitch(waId, reasonId) {
  const pitch = RETENTION_PITCHES[reasonId] || RETENTION_PITCHES.reason_outro;
  await sendButtons(waId, `${pitch}\n\nQuer que eu veja essa condição especial pra você continuar?`, [
    { id: 'retention_yes', title: 'Quero continuar' },
    { id: 'retention_no', title: 'Retirar equipamento' },
  ]);
}

async function askRetentionLastChance(waId) {
  await sendButtons(
    waId,
    'Antes de eu confirmar de vez o agendamento da retirada: tem certeza? Ainda dá tempo de eu te passar a condição especial ' +
      'e você continuar com a gente. 🙏',
    [
      { id: 'retention_yes', title: 'Quero a condição' },
      { id: 'retention_final_no', title: 'Confirmar retirada' },
    ]
  );
}

const RETENTION_STEPS = [
  { state: 'AWAITING_RET_NOME', field: 'nomeCompleto', prompt: 'Perfeito! Vamos começar. Qual o nome completo (do titular do novo contrato)?' },
  { state: 'AWAITING_RET_CPF', field: 'cpf', prompt: 'Qual o CPF?' },
  { state: 'AWAITING_RET_RG', field: 'rg', prompt: 'Qual o RG?' },
  { state: 'AWAITING_RET_NASCIMENTO', field: 'dataNascimento', prompt: 'Qual a data de nascimento? (dd/mm/aaaa)' },
  { state: 'AWAITING_RET_MAE', field: 'nomeMae', prompt: 'Qual o nome da mãe?' },
  { state: 'AWAITING_RET_EMAIL', field: 'email', prompt: 'Qual o e-mail?' },
  { state: 'AWAITING_RET_ENDERECO', field: 'endereco', prompt: 'Qual o endereço completo, com CEP e complemento?' },
  { state: 'AWAITING_RET_PLANO', field: 'plano' }, // sem prompt de texto — ver askRetentionPlano()
  { state: 'AWAITING_RET_TEL1', field: 'telefone1', prompt: 'Qual o telefone 1 para contato?' },
  { state: 'AWAITING_RET_TEL2', field: 'telefone2', prompt: 'Qual o telefone 2 para contato? Se não tiver outro, responde "não".' },
];

const RETENTION_PLANS = [
  { id: 'plano_200mega', title: '200 Mega', description: 'R$ 79,99/mês', label: '200 Mega - R$ 79,99/mês' },
  { id: 'plano_400mega', title: '400 Mega', description: 'R$ 94,99/mês', label: '400 Mega - R$ 94,99/mês' },
  { id: 'plano_600mega', title: '600 Mega', description: 'R$ 99,99/mês', label: '600 Mega - R$ 99,99/mês' },
  { id: 'plano_1giga', title: '1 Giga', description: 'R$ 125,99/mês', label: '1 Giga - R$ 125,99/mês' },
];

async function askRetentionPlano(waId) {
  await sendText(
    waId,
    '🚨 *OFERTA IMPERDÍVEL DESKTOP!* 🚨\n\n' +
      'Internet de alta velocidade com preços promocionais e benefícios exclusivos, só pra quem decidiu continuar com a gente. ' +
      'Essa condição é por tempo limitado — escolhe o plano ideal pra sua casa:\n\n' +
      '⚡ *200 Mega* — R$ 79,99/mês\n✅ Wi-Fi de alta velocidade\n\n' +
      '⚡ *400 Mega* — R$ 94,99/mês\n✅ Wi-Fi de alta velocidade\n✅ Antivírus Kaspersky para 1 dispositivo\n\n' +
      '⚡ *600 Mega* — R$ 99,99/mês\n✅ Wi-Fi de alta velocidade\n✅ Antivírus Kaspersky para até 3 dispositivos\n✅ Paramount+ incluso\n\n' +
      '🚀 *1 Giga* — R$ 125,99/mês\n✅ Nova geração de Wi-Fi 6\n✅ Antivírus Kaspersky para até 3 dispositivos\n✅ Paramount+ incluso\n\n' +
      'Uma oportunidade dessas não aparece toda hora — aproveita! 🔥'
  );
  await sendList(waId, 'Qual plano você quer aproveitar?', 'Ver planos', [
    { title: 'Planos DESKTOP', rows: RETENTION_PLANS.map((p) => ({ id: p.id, title: p.title, description: p.description })) },
  ]);
}

// Botão de quick-reply do template msg_inicial_v1: a Meta manda o texto do
// botão como payload (não um id customizado), então mapeamos pelo título.
function findRetentionReasonByPayload(payload) {
  return RETENTION_REASONS.find((r) => normalize(r.title) === normalize(payload));
}

function retentionStepIndex(state) {
  return RETENTION_STEPS.findIndex((s) => s.state === state);
}

async function askRetentionStep(waId, index) {
  await sendText(waId, RETENTION_STEPS[index].prompt);
}

// Troca de estado da conversa + registro do passo no funil de abandono
// (bot_funnel_events) — permite ver em que etapa exata o cliente parou de
// responder, tanto no fluxo de retenção quanto no de retirada.
async function goTo(waId, state, data) {
  await logFunnelStep(waId, state);
  await setConversationState(waId, state, data);
}

async function handleConversation({ waId, contactId, msg, profileName }) {
  const input = extractInput(msg);
  const current = await getConversationState(waId);
  const state = current?.state || null;
  const data = current?.data || {};

  // Clique num botão de quick-reply do template msg_inicial_v1 (motivo do
  // cancelamento) pode chegar em qualquer estado, já que o template é
  // disparado direto pra fora do fluxo normal do bot — trata antes de tudo.
  if (input.kind === 'button') {
    const reason = findRetentionReasonByPayload(input.payload);
    if (reason) {
      await askRetentionPitch(waId, reason.id);
      await goTo(waId, 'AWAITING_RETENTION_OFFER', { ...data, motivo: reason.id });
      return;
    }
  }

  // Sem estado ativo: só reage a algo parecido com saudação/menu; ignora o resto.
  if (!state) {
    if (input.kind === 'text' && !isGreeting(input.value)) return;
    const greeting = profileName ? `Olá, ${profileName}! 👋 Seja bem-vindo(a).` : 'Olá! 👋 Seja bem-vindo(a).';
    await sendText(waId, greeting);
    await sendMainMenu(waId);
    await goTo(waId, 'AWAITING_MENU', {});
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
        `Perfeito! Um dos nossos consultores da ${BRAND} vai te chamar por aqui para falar sobre planos de internet. 📶`
      );
      await clearConversationState(waId);
      return;
    }
    if (input.id === 'menu_pickup') {
      await askRetentionReason(waId);
      await goTo(waId, 'AWAITING_RETENTION_REASON', {});
      return;
    }
    await sendMainMenu(waId);
    return;
  }

  if (state === 'AWAITING_RETENTION_REASON') {
    if (input.kind !== 'interactive' || !RETENTION_REASONS.some((r) => r.id === input.id)) {
      await askRetentionReason(waId);
      return;
    }
    await askRetentionPitch(waId, input.id);
    await goTo(waId, 'AWAITING_RETENTION_OFFER', { ...data, motivo: input.id });
    return;
  }

  if (state === 'AWAITING_RETENTION_OFFER') {
    if (input.kind !== 'interactive') {
      await askRetentionPitch(waId, data.motivo);
      return;
    }
    if (input.id === 'retention_yes') {
      await askRetentionStep(waId, 0);
      await goTo(waId, RETENTION_STEPS[0].state, { motivo: data.motivo });
      return;
    }
    if (input.id === 'retention_no') {
      await askRetentionLastChance(waId);
      await goTo(waId, 'AWAITING_RETENTION_LASTCHANCE', data);
      return;
    }
    await askRetentionPitch(waId, data.motivo);
    return;
  }

  if (state === 'AWAITING_RETENTION_LASTCHANCE') {
    if (input.kind !== 'interactive') {
      await askRetentionLastChance(waId);
      return;
    }
    if (input.id === 'retention_yes') {
      await askRetentionStep(waId, 0);
      await goTo(waId, RETENTION_STEPS[0].state, { motivo: data.motivo });
      return;
    }
    if (input.id === 'retention_final_no') {
      await askDate(waId);
      await goTo(waId, 'AWAITING_DATE', {});
      return;
    }
    await askRetentionLastChance(waId);
    return;
  }

  if (state === 'AWAITING_RET_PLANO') {
    if (input.kind !== 'interactive') {
      await askRetentionPlano(waId);
      return;
    }
    const plan = RETENTION_PLANS.find((p) => p.id === input.id);
    if (!plan) {
      await askRetentionPlano(waId);
      return;
    }
    const updated = { ...data, plano: plan.label };
    const nextIdx = retentionStepIndex('AWAITING_RET_PLANO') + 1;
    await askRetentionStep(waId, nextIdx);
    await goTo(waId, RETENTION_STEPS[nextIdx].state, updated);
    return;
  }

  if (state && state.startsWith('AWAITING_RET_')) {
    const idx = retentionStepIndex(state);
    const step = RETENTION_STEPS[idx];
    if (input.kind !== 'text' || !input.value.trim()) {
      await askRetentionStep(waId, idx);
      return;
    }
    const trimmed = input.value.trim();
    const isSkippedPhone2 = step.field === 'telefone2' && /^n[aã]o$/i.test(trimmed);
    if (!isSkippedPhone2) {
      const validator = RETENTION_VALIDATORS[step.field];
      if (validator && !validator(trimmed)) {
        await sendText(waId, RETENTION_INVALID_MESSAGES[step.field]);
        await askRetentionStep(waId, idx);
        return;
      }
    }
    const value = isSkippedPhone2 ? null : step.field === 'cpf' ? trimmed.replace(/\D/g, '') : trimmed;
    const updated = { ...data, [step.field]: value };

    const nextIdx = idx + 1;
    if (nextIdx < RETENTION_STEPS.length) {
      const nextStep = RETENTION_STEPS[nextIdx];
      if (nextStep.field === 'plano') {
        await askRetentionPlano(waId);
      } else {
        await askRetentionStep(waId, nextIdx);
      }
      await goTo(waId, nextStep.state, updated);
      return;
    }

    await insertRetentionLead({ contactId, waId, ...updated });
    await syncRetentionLead({
      waId,
      motivoLabel: RETENTION_REASONS.find((r) => r.id === data.motivo)?.title,
      ...updated,
    });
    await logFunnelStep(waId, 'RETENCAO_CONCLUIDA');
    await sendText(
      waId,
      'Show, recebi todos os dados! ✅ Um dos nossos consultores vai analisar e entrar em contato em breve ' +
        'para fechar essa condição especial pra você continuar com a gente.'
    );
    await clearConversationState(waId);
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
      await goTo(waId, 'AWAITING_DATE', {});
      return;
    }

    await askPeriod(waId, periods);
    await goTo(waId, 'AWAITING_PERIOD', {
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
    const knownAddress = await getKnownAddress(waId);
    if (knownAddress) {
      await askAddressConfirm(waId, knownAddress);
      await goTo(waId, 'AWAITING_ADDRESS_CONFIRM', { ...data, period, knownAddress });
      return;
    }
    await askAddress(waId);
    await goTo(waId, 'AWAITING_ADDRESS', { ...data, period });
    return;
  }

  if (state === 'AWAITING_ADDRESS_CONFIRM') {
    if (input.kind !== 'interactive') {
      await askAddressConfirm(waId, data.knownAddress);
      return;
    }
    if (input.id === 'address_yes') {
      await askPhone(waId);
      await goTo(waId, 'AWAITING_PHONE', { ...data, address: data.knownAddress });
      return;
    }
    if (input.id === 'address_no') {
      await askAddress(waId);
      await goTo(waId, 'AWAITING_ADDRESS', data);
      return;
    }
    await askAddressConfirm(waId, data.knownAddress);
    return;
  }

  if (state === 'AWAITING_ADDRESS') {
    if (input.kind === 'location') {
      const address = await resolveLocationAddress(input);
      await askAddressNumber(waId);
      await goTo(waId, 'AWAITING_ADDRESS_NUMBER', { ...data, address });
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
    await goTo(waId, 'AWAITING_PHONE', { ...data, address: input.value });
    return;
  }

  if (state === 'AWAITING_ADDRESS_NUMBER') {
    if (input.kind !== 'text' || !input.value.trim()) {
      await askAddressNumber(waId);
      return;
    }
    const address = `${data.address} - nº ${input.value.trim()}`;
    await askPhone(waId);
    await goTo(waId, 'AWAITING_PHONE', { ...data, address });
    return;
  }

  if (state === 'AWAITING_PHONE') {
    const digits = input.kind === 'text' ? input.value.replace(/\D/g, '') : '';
    if (digits.length < 10) {
      await sendText(waId, 'Esse telefone parece inválido. Pode me enviar novamente com DDD?');
      return;
    }
    const updated = { ...data, contactPhone: input.value };
    await askObservation(waId);
    await goTo(waId, 'AWAITING_OBSERVATION', updated);
    return;
  }

  if (state === 'AWAITING_OBSERVATION') {
    if (input.kind !== 'text' || !input.value.trim()) {
      await askObservation(waId);
      return;
    }
    const noObservation = /^n[aã]o$/i.test(input.value.trim());
    const updated = { ...data, observacao: noObservation ? null : input.value.trim() };
    await askConfirmation(waId, updated);
    await goTo(waId, 'AWAITING_CONFIRM', updated);
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
        observacao: data.observacao,
      });
      await syncPickupScheduled({
        waId,
        pickupDate: data.pickupDate,
        period: data.period,
        address: data.address,
        contactPhone: data.contactPhone,
        observacao: data.observacao,
      });
      await logFunnelStep(waId, 'RETIRADA_CONFIRMADA');
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
      await goTo(waId, 'AWAITING_DATE', {});
      return;
    }
    await askConfirmation(waId, data);
  }
}

module.exports = { handleConversation, askRetentionReason, BRAND };
