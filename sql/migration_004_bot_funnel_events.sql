-- Log leve de cada passo da conversa do bot (fluxo de retirada e de
-- retenção), usado só para montar o gráfico de funil/abandono no dashboard
-- (Visão Geral). Não substitui case_status_history: aqui é por wa_id, sem
-- vínculo obrigatório com um case_record.
create table if not exists bot_funnel_events (
  id uuid primary key default gen_random_uuid(),
  wa_id text not null,
  step text not null,
  created_at timestamptz not null default now()
);

create index if not exists bot_funnel_events_step_idx on bot_funnel_events(step);
create index if not exists bot_funnel_events_wa_id_idx on bot_funnel_events(wa_id);
