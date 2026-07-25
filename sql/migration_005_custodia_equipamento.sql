-- Custódia de equipamento: controla quando o equipamento retirado pelo
-- técnico foi fisicamente devolvido/conferido na base ("bipado"), antes de
-- liberar a baixa no sistema externo.
alter table pickup_equipment add column if not exists returned_to_base_at timestamptz;
alter table pickup_equipment add column if not exists returned_to_base_by_user_id uuid references app_users(id);

-- Novo status intermediário: aguardando a devolução física do equipamento
-- (antes de "aguardando baixa", que agora significa "já devolvido, falta
-- só processar no sistema externo"). Rodar contra DIRECT_DATABASE_URL
-- (sem pgbouncer) — ALTER TYPE ... ADD VALUE não roda bem atrás do pooler
-- em modo transaction.
alter type "ClosureStatus" add value if not exists 'AGUARDANDO_DEVOLUCAO';
