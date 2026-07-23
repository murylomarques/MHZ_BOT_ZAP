# MHZ Retira — Arquitetura

> Nome provisório do sistema: **MHZ Retira — Central de Retirada de Equipamentos**
> (configurável em `system_settings`, ver seção Configurações).

## Contexto

O `MHZ_BOT_ZAP` já roda em produção na Vercel como um webhook simples (Node puro,
sem framework) que conversa com clientes no WhatsApp sobre retirada de equipamento,
com estado de conversa em Postgres (Supabase). Esse bot **não é substituído** —
ele continua funcionando exatamente como está.

Este documento descreve como o sistema completo pedido (central operacional,
importação de base, gestão de campanhas do bot, atendimento, agenda, mapa/rotas,
baixas, relatórios, auditoria) é construído **em cima** do mesmo repositório e do
mesmo banco, sem quebrar o que já está no ar.

## Por que reaproveitar este repositório (e não `MHZ Retira Pro` ou um projeto novo)

- Já está deployado e configurado na Vercel (domínio, envs, webhook validado pela Meta).
- O bot conversacional (`lib/whatsapp.js`, `lib/conversation.js`, `api/webhook.js`)
  é o canal real de contato com o cliente — recriar isso do zero seria retrabalho puro.
- O banco (Supabase Postgres) já tem `contacts`, `messages`, `conversation_states`,
  `pickup_requests`, `retention_leads` povoados com dados reais.
- Existe outro protótipo (`D:\MHZ Retira Pro`) com domínio de logística reversa
  (motoboy/retirada/base), mas sem nada do universo bot/CSV/CRM — foi avaliado e
  descartado como base porque seria mais trabalho adaptar o domínio dele do que
  construir o novo por cima do bot que já roda.

## Stack

| Camada | Escolha | Observação |
|---|---|---|
| App web + API | Next.js 14 (App Router) + TypeScript | Convive no mesmo repo/deploy Vercel com `api/webhook.js` (Vercel builda ambos sem conflito) |
| Banco | PostgreSQL (Supabase, já existente) | Prisma gerencia as tabelas **novas**; tabelas legadas (`contacts`, `messages`, `conversation_states`, `pickup_requests`, `retention_leads`, `message_status_updates`) são introspectadas e mantidas como estão — o bot atual continua lendo/escrevendo nelas sem alteração |
| ORM | Prisma 6 | `prisma db pull` para baseline das tabelas legadas + schema novo por cima |
| Auth | JWT em cookie httpOnly + secure, Argon2 para senha | Sem NextAuth — RBAC + escopo por cidade é específico o suficiente para justificar implementação própria |
| Fila / jobs | Tabela `jobs` no Postgres + Vercel Cron | BullMQ/Redis exige worker persistente, que não roda bem em serverless da Vercel. Fica documentado como trocar para BullMQ+Redis caso saiam do serverless puro |
| Geocodificação | Provider abstrato (`GeocodingProvider`), cache em `geocode_cache` | Implementação inicial via Nominatim (OSM, gratuito) |
| Mapas | Leaflet + OpenStreetMap | Sem custo, conforme pedido |
| Mensageria bot | Adaptador `MessagingProvider` | `MetaWhatsAppProvider` (real, reaproveita `lib/whatsapp.js`) para o canal conversacional; `MatrixDesktopProvider` (mock documentado) para o canal de disparo em massa (é o que a base CSV indica — erros de `desktop.matrixdobrasil.ai` — mas não temos credencial/documentação dessa API ainda) |
| Gráficos | Recharts | |
| Validação | Zod | |

## Estrutura de pastas (adicionada)

```
app/                        Next.js App Router (novo)
  (auth)/login
  (app)/dashboard
  (app)/operacoes
  (app)/atendimento
  (app)/bot
  (app)/agenda
  (app)/mapa
  (app)/baixas
  (app)/relatorios
  (app)/importacoes
  (app)/motoboys
  (app)/usuarios
  (app)/configuracoes
  (app)/auditoria
  api/...                    Route handlers da API nova (distinto de api/webhook.js legado)
lib/
  server/                    Código novo do sistema (TS)
    auth/                    sessão, RBAC, permissões por cidade
    providers/                MessagingProvider, GeocodingProvider (+ mocks)
    import/                   parser e upsert do CSV
    queue/                    fila baseada em tabela + handlers de job
  whatsapp.js, conversation.js, db.js   (legado, intocado — bot em produção)
api/webhook.js               (legado, intocado — bot em produção)
prisma/
  schema.prisma
  migrations/
sql/                         (legado, mantido para referência histórica)
TASKS.md                     Checklist de implementação por fase
```

## Modelo de dados novo

Ver `prisma/schema.prisma`. Resumo das entidades (nomes ajustados do spec para
`snake_case`/plural em português onde fazia sentido, mantendo consistência):

- **Acesso**: `User`, `Role` (enum fixo ADMIN/GESTOR/ATENDENTE), `UserCityPermission`
- **Clientes/OS**: `Customer`, `CustomerAddress`, `ServiceOrder` (SA/WO), `CaseRecord`
  (o "caso" de retirada — status, prioridade, SLA), `CaseAssignment`, `CaseStatusHistory`,
  `CaseTag`, `CaseNote`
- **Importação**: `ImportBatch`, `ImportRow`, `ImportError`
- **Bot**: `BotTemplate`, `BotCampaign`, `BotCampaignItem`, `BotMessage`,
  `BotMessageEvent`, `BotWebhookEvent`
- **Atendimento**: `Conversation`, `ConversationMessage`, `QuickReply`
- **Agenda**: `Appointment`, `AppointmentHistory`, `CityCapacityRule`, `BlockedDate`
- **Logística**: `Courier`, `CourierCoverage`, `Route`, `RouteStop`, `RouteHistory`
- **Retirada**: `Pickup`, `PickupAttempt`, `PickupEquipment`, `PickupProof`
- **Baixa**: `SystemClosure`, `ClosureAttempt`
- **Suporte**: `Notification`, `Task`, `IntegrationConfig`, `AuditLog`, `SystemSetting`,
  `GeocodeCache`, `Job`

Todas as tabelas novas usam `uuid` como PK (`gen_random_uuid()`), `created_at`/
`updated_at` em UTC, e `created_by`/`updated_by` onde faz sentido. Exibição no
fuso `America/Sao_Paulo` é feita na camada de apresentação, não no banco.

## Máquina de estados do caso (`CaseRecord.status`)

Ver enum `CaseStatus` no schema e `lib/server/status-transitions.ts` para as
transições permitidas. Regra geral: o status só avança dentro do fluxo descrito
na seção 3 do spec original; qualquer mudança grava uma linha em
`CaseStatusHistory` com status anterior, novo, autor, motivo, observação e origem
(`bot` | `atendente` | `gestor` | `integracao` | `importacao`).

## Fases de implementação

Ver `TASKS.md`.
