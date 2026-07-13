-- Rode este arquivo no SQL editor do Supabase para atualizar um banco já existente
-- (adiciona campo de observação na retirada e a tabela de leads de retenção).

alter table pickup_requests add column if not exists observacao text;

create table if not exists retention_leads (
  id              bigserial primary key,
  contact_id      bigint references contacts(id),
  wa_id           text not null,
  nome_completo   text,
  cpf             text,
  rg              text,
  data_nascimento text,
  nome_mae        text,
  email           text,
  endereco        text,
  plano           text,
  telefone1       text,
  telefone2       text,
  status          text not null default 'pending',
  created_at      timestamptz not null default now()
);

create index if not exists idx_retention_leads_wa_id on retention_leads(wa_id);
