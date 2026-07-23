-- Rode este arquivo no SQL editor do Supabase (ou via conexão direta, sem
-- pgbouncer) para adicionar o status de cliente retido pelo fluxo de retenção
-- do bot ao enum CaseStatus do sistema novo (MHZ Retira).

alter type "CaseStatus" add value if not exists 'CLIENTE_RETIDO';
