-- Troca o template inicial da campanha padrão pelo fluxo direto de retiradas.
update bot_templates
set
  internal_name = 'Retirada — foco em agendamento',
  hsm_code = 'msg_inicio_foco_retiradas',
  flow_code = null,
  preview_text = 'Vamos agendar sua retirada. O processo possui apenas 3 etapas e leva menos de 1 minuto: confirmar o endereço, escolher a data e o período, revisar e confirmar. [botão: Começar]',
  variables = '["customer_name"]'::jsonb,
  updated_at = now()
where id = '00000000-0000-0000-0000-000000000010';
