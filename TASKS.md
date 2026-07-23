# MHZ Retira — Checklist de implementação

Ordem seguida (adaptada da seção 26 do spec). Marcar `[x]` ao concluir.
Ver `ARCHITECTURE.md` para as decisões de stack.

## Fase 0 — Base já existente (bot em produção, intocado)
- [x] Webhook Meta/WhatsApp (`api/webhook.js`)
- [x] Envio de texto/botões/listas (`lib/whatsapp.js`)
- [x] Fluxo de conversa e retenção (`lib/conversation.js`)
- [x] Persistência em Supabase (`contacts`, `messages`, `conversation_states`,
      `pickup_requests`, `retention_leads`, `message_status_updates`)
- [x] Script de contato ativo (`scripts/send-proactive-pickup.js`)

## Fase 1 — Fundação do sistema novo
- [x] Documento de arquitetura (`ARCHITECTURE.md`)
- [x] Next.js App Router instalado no mesmo repo, convivendo com `api/webhook.js`
- [x] Prisma configurado, baseline das tabelas legadas via `db pull`
- [x] Schema Prisma completo do domínio novo (`prisma/schema.prisma`)
- [x] Migration aplicada (44 tabelas novas, tabelas legadas recriadas — ver
      incidente registrado no README)
- [x] Seed de desenvolvimento (admin, gestor, 3 atendentes, 1 motoboy, 1
      template, 1 campanha exemplo) — `prisma/seed.ts`

## Fase 2 — Autenticação e permissões
- [x] Login com Argon2 + JWT em cookie httpOnly/secure
- [x] RBAC no backend (`lib/server/auth/rbac.ts`, checado nas rotas, não só na UI)
- [x] Permissão por cidade (`UserCityPermission` + `getAllowedCities`) — modelo
      pronto, ainda não aplicado como filtro automático nas queries de listagem
- [x] Rate limit no login (`isLoginRateLimited`, baseado em audit_logs)
- [x] Auditoria de login/logout/tentativa inválida/atribuição de caso/importação

## Fase 3 — Importação do CSV
- [x] Parser do `base_disparo_misto_*.csv` (bulk, `createMany` em lote)
- [x] Upsert por `sa_id` (principal), `wo_number` guardado como secundário
- [x] Sinalização de telefone duplicado (não é chave única)
- [x] Detecção de cidade não reconhecida, telefone inválido, linha inválida, SA/WO duplicada
- [x] Resumo do lote (`ImportBatch` + `ImportRow` + `ImportError`)
- [x] Tela de importação com upload (`/importacoes`) — sem barra de progresso
      granular ainda (spec pede "apresentar progresso"); hoje é upload → aguarda → resumo final
- [x] Base real importada e verificada: 7.329 casos, distribuição por cidade
      batendo com o esperado (Campinas 3065, Sorocaba 2399, Indaiatuba 666,
      Franco da Rocha 531, Votorantim 330, Cabreúva 164, Araçariguama 117,
      Francisco Morato 57)

## Fase 4 — Dashboard executivo
- [x] Cards com números reais da base importada (clicáveis → `/operacoes?status=...`)
- [x] Registros por cidade (barra) + funil de status completo
- [ ] Filtros por período, atendente, motoboy, campanha, HSM, flow, erro (só cidade/status hoje)
- [ ] Gráficos adicionais (disparos/hora, conversão, produtividade, comparativo de períodos)

## Fase 5 — Central de Operações
- [x] Tabela com busca (nome/telefone/SA/WO) e filtro por cidade/status
- [x] Controle de concorrência real (INSERT...ON CONFLICT condicional — dois
      atendentes não conseguem assumir o mesmo caso, testado via SQL atômico)
- [ ] Visão Kanban (só tabela por enquanto)
- [ ] Atribuição em massa, seleção múltipla, etiquetas, filtros salvos, exportação

## Fase 6 — Página do cliente/retirada
- [x] Layout com as seções principais (cliente, externo, atendimento, bot,
      agendamento, logística, equipamentos, baixa, linha do tempo) — exibe
      dados reais via Prisma
- [ ] Edição inline de cada seção (hoje é só leitura + botão "assumir caso")

## Fase 7 — Central de Atendimento (inbox)
- [ ] Filas (não atribuídos, meus, aguardando cliente, divergente, fora do SLA, finalizados hoje)
- [ ] Assumir/transferir, respostas rápidas, observação interna
- [ ] Diferenciação visual bot/atendente/cliente

## Fase 8 — Gestão do Bot
- [x] `MessagingProvider` (interface + `MetaWhatsAppProvider` real + `MatrixDesktopProvider` mock documentado)
- [ ] Templates (HSM/Flow) CRUD
- [ ] Campanhas (criar, iniciar, pausar, encerrar, reprocessar erros)
- [ ] Indicadores de campanha
- [ ] Fila de disparo baseada em tabela + Vercel Cron (retentativa exponencial, idempotência, rate limit)

## Fase 9 — Agenda
- [x] Visões (dia/semana/mês, filtro por cidade) — `/agenda`; filtro por motoboy fica
      para a Fase 10 (rotas ainda não existem)
- [x] Capacidade por cidade/janela, bloqueio de datas/feriados — validado na criação
      via API, CRUD em `/configuracoes/capacidade`
- [x] Reagendamento/cancelamento — `PATCH`/`DELETE` em `/api/appointments/[id]`

## Fase 10 — Mapa e Rotas
- [ ] Geocodificação com fila + cache (`GeocodingProvider`)
- [ ] Mapa de calor + marcadores por status/cidade/motoboy/data (Leaflet)
- [ ] Agrupamento geográfico + Haversine + vizinho mais próximo + 2-opt
- [ ] Criação/edição de rota, vínculo de motoboy

## Fase 11 — Retiradas
- [x] Registro de execução (equipamentos, resultado, comprovante, fotos) —
      `/retiradas` (lista) e `/retiradas/[caseId]` (formulário); comprovante
      simplificado para URL de texto (sem infra de upload real ainda)
- [x] Transição automática para `AGUARDANDO_BAIXA` (via `EQUIPAMENTO_RETIRADO`)
      e criação automática do `SystemClosure` (status AGUARDANDO)

## Fase 12 — Baixas
- [x] Telas por status (aguardando/processando/realizada/erro/divergência) — `/baixas`
- [x] Baixa individual e em massa (`/api/closures/[id]`, `/api/closures/bulk`),
      alerta de atraso (> 48h aguardando, constante `OVERDUE_HOURS`) — chamada
      externa real ainda não documentada/credenciada, mock isolado em
      `lib/server/closures/process-closure.ts`

## Fase 13 — Relatórios
- [ ] Todos os relatórios do spec com export CSV/Excel

## Fase 14 — Alertas e SLA
- [ ] Motor de SLA configurável por status/cidade/prioridade

## Fase 15 — Auditoria
- [ ] `AuditLog` cobrindo todas as ações listadas no spec

## Fase 16 — Testes
- [ ] Testes dos fluxos críticos (Vitest + Playwright)

## Fase 17 — Revisão final
- [ ] Responsividade/acessibilidade
- [ ] README atualizado com tudo (usuários demo, comandos, envs)

---

**Status atual:** Fases 1–3 concluídas e verificadas com dados reais; Fases 4–6
parcialmente implementadas (leitura funcionando, faltam filtros/edição
avançados); Fases 7–17 ainda não iniciadas. Ver README para como rodar e para
o incidente de produção ocorrido durante a Fase 1 (tabelas do bot legado foram
derrubadas e recriadas — estrutura ok, histórico de conversas anterior perdido).
