const WINDOW_TO_PERIOD_LABEL: Record<string, string> = {
  "08:00": "Manhã",
  "13:00": "Tarde",
  "19:00": "Noite",
};

// Formato usado pra colar direto num grupo de WhatsApp de motoboys — pedido
// específico do negócio. Não inclui número de WO (só SA), como confirmado.
export function buildGroupCopyText(params: {
  city: string;
  saId: string;
  customerName: string;
  phone: string;
  originalAddress: string;
  appointmentAddress?: string | null;
  observation?: string | null;
  windowStart?: string | null;
  date?: Date | null;
  // Agendamento parcial (cliente escolheu dia/período mas não confirmou o
  // endereço) — endereço usado é o do cadastro, não confirmado de verdade.
  confirmedByClient?: boolean;
}): string {
  // Agendamento (data/janela/endereço confirmado) ainda pode não existir —
  // ex: caso em CLIENTE_RESPONDEU, antes de marcar dia/horário com o cliente.
  const hasAppointmentAddress = !!params.appointmentAddress;
  const isPartial = hasAppointmentAddress && params.confirmedByClient === false;
  const addressConfirmed = isPartial
    ? false
    : hasAppointmentAddress
      ? params.appointmentAddress!.trim() === params.originalAddress.trim()
      : false;
  const dateLabel = params.date
    ? params.date.toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit" })
    : "A definir";
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(params.originalAddress)}`;
  const periodLabel = params.windowStart
    ? WINDOW_TO_PERIOD_LABEL[params.windowStart] ?? params.windowStart
    : "A definir";

  const lines = [
    `[GRUPO: ${params.city.toUpperCase()}]`,
    params.saId,
    `Nome: ${params.customerName}`,
    `Número: ${params.phone}`,
    `Endereço: ${params.originalAddress}`,
    `Endereço confirmado pelo cliente: ${addressConfirmed ? "Sim" : isPartial ? "Não (agendamento parcial — endereço do cadastro)" : "Não"}`,
  ];
  if (hasAppointmentAddress && !addressConfirmed && !isPartial) {
    lines.push(`Endereço corrigido pelo cliente: ${params.appointmentAddress}`);
  }
  lines.push(`Observação informada pelo cliente: ${params.observation?.trim() || "Não"}`);
  lines.push(`Mapa: ${mapUrl}`);
  lines.push(`Horário: ${periodLabel}`);
  lines.push(dateLabel);

  return lines.join("\n");
}
