-- Schema para armazenar dados recebidos do webhook do WhatsApp (Meta)
-- Execute este arquivo uma vez no banco Postgres (Supabase) antes de usar o webhook.

create table if not exists contacts (
  id           bigserial primary key,
  wa_id        text unique not null,       -- número/ID do WhatsApp do contato
  profile_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists messages (
  id             bigserial primary key,
  wa_message_id  text unique,               -- id da mensagem retornado pela Meta
  contact_id     bigint references contacts(id),
  direction      text not null check (direction in ('inbound', 'outbound')),
  message_type   text,                      -- text, image, audio, document, etc.
  body           text,                      -- conteúdo textual (quando aplicável)
  media_url      text,                      -- url/id de mídia (quando aplicável)
  wa_timestamp   timestamptz,               -- timestamp enviado pela Meta
  raw_payload    jsonb not null,            -- payload completo recebido, para auditoria
  created_at     timestamptz not null default now()
);

create table if not exists message_status_updates (
  id             bigserial primary key,
  wa_message_id  text not null,
  status         text not null,             -- sent, delivered, read, failed
  wa_timestamp   timestamptz,
  raw_payload    jsonb not null,
  created_at     timestamptz not null default now()
);

create index if not exists idx_messages_contact_id on messages(contact_id);
create index if not exists idx_message_status_updates_wa_message_id on message_status_updates(wa_message_id);
