# MHZ Retira — Central de Retirada de Equipamentos

Sistema completo de controle de retirada de equipamentos da MHZ Telecom,
construído em cima do bot de WhatsApp que já roda em produção neste mesmo
repositório/deploy na Vercel. Ver `ARCHITECTURE.md` para as decisões de stack
e `TASKS.md` para o que já está pronto e o que falta.

O bot conversacional original (seção abaixo) continua funcionando exatamente
como antes — nada nele foi alterado.

## Setup do sistema novo

```bash
npm install
cp .env.example .env   # preencha DATABASE_URL, DIRECT_DATABASE_URL, SESSION_SECRET
npx prisma generate
npm run db:seed        # cria os usuários de demonstração
npm run dev            # http://localhost:3000
```

### Variáveis de ambiente (sistema novo)

- `DIRECT_DATABASE_URL`: conexão direta ao Postgres (sem pooler PgBouncer),
  usada só por `prisma migrate`/scripts administrativos. No Supabase: mesmo
  host do `DATABASE_URL`, trocando a porta `6543` por `5432`.
- `SESSION_SECRET`: segredo para assinar o cookie de sessão (JWT). Gerar com
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- `MATRIX_DESKTOP_API_URL` / `MATRIX_DESKTOP_API_TOKEN`: integração de
  disparo em massa (HSM/Flow) — ainda **mock**, sem credencial real (ver
  `lib/server/providers/matrix-desktop-provider.ts`).

### Usuários de demonstração (seed)

Senha para todos: `MhzRetira@2026`

| E-mail | Papel |
|---|---|
| admin@mhzretira.com | ADMIN |
| gestor@mhzretira.com | GESTOR |
| atendente1@mhzretira.com / atendente2 / atendente3 | ATENDENTE |

### Importando a base CSV

Pela UI: `/importacoes` → upload do arquivo. Para um arquivo já no disco,
`npx tsx scripts/run-import.ts caminho/para/base.csv` (upsert por `sa_id`,
seguro rodar mais de uma vez).

### Incidente conhecido (documentado para transparência)

Durante a criação do schema novo, um `prisma db push` mal executado
(`--accept-data-loss=false` não bloqueia a operação como parece) apagou as
tabelas do bot legado (`contacts`, `messages`, `conversation_states`,
`message_status_updates`, `pickup_requests`) em produção. A estrutura foi
recriada a partir de `sql/schema.sql` e o bot voltou a funcionar
normalmente, mas o histórico de conversas anterior a esse momento foi
perdido (sem backup do Supabase disponível). Não usar `prisma migrate
dev`/`db push` direto contra a `DATABASE_URL` de produção sem antes gerar e
revisar o SQL com `prisma migrate diff` (é assim que as 44 tabelas novas
foram criadas, de forma segura).

---

# MHZ_BOT_ZAP (bot original)

Webhook para receber eventos do WhatsApp (Meta/Cloud API) e armazenar mensagens e status no Postgres (Supabase). Feito para deploy na Vercel (Serverless Functions).

## Estrutura

- `api/webhook.js` — endpoint do webhook (`GET` valida o token da Meta, `POST` recebe mensagens/status)
- `lib/db.js` — conexão e queries no Postgres
- `lib/whatsapp.js` — envio de mensagens (texto, botões, listas) via Graph API da Meta
- `lib/conversation.js` — máquina de estados do bot de atendimento
- `sql/schema.sql` — script para criar as tabelas no Supabase

## Bot de atendimento

Quando alguém manda uma saudação (oi, bom dia, boa tarde, etc.), o bot responde pelo nome salvo no contato do WhatsApp (quando disponível) e oferece um menu com duas opções:

1. **Contratar internet** — encaminha para um consultor humano.
2. **Retirar equipamento** — inicia o agendamento:
   1. Escolha da data (hoje até 3 dias à frente) — dias/períodos que já passaram no fuso de São Paulo não aparecem como opção (ex: se já passou das 22h, hoje some da lista)
   2. Escolha do período (manhã 08h-12h, tarde 13h-18h ou noite 19h-22h) — só mostra os períodos que ainda não passaram no dia escolhido
   3. Confirmação do endereço de retirada — pode digitar (validado: precisa de rua, número, bairro e cidade) ou compartilhar a localização pelo WhatsApp; nesse caso o bot converte as coordenadas em endereço (reverse geocoding via Nominatim/OpenStreetMap) e sempre pergunta o número da casa/complemento, já que a localização sozinha não traz isso
   4. Telefone alternativo para contato
   5. Resumo e confirmação final

O agendamento confirmado é salvo na tabela `pickup_requests`. O estado da conversa de cada contato fica em `conversation_states` (necessário porque as funções da Vercel são stateless entre requisições).

## Configuração

### 1. Banco de dados

No SQL Editor do Supabase, rode o conteúdo de `sql/schema.sql` uma vez para criar as tabelas `contacts`, `messages`, `message_status_updates`, `conversation_states` e `pickup_requests`.

### 2. Variáveis de ambiente

Copie `.env.example` para `.env` (uso local) e preencha:

- `DATABASE_URL`: string de conexão do Supabase (Settings → Database → Connection string)
- `WEBHOOK_VERIFY_TOKEN`: qualquer string secreta gerada por você, usada na verificação do webhook
- `WHATSAPP_TOKEN`: token de acesso do app na Meta (Meta for Developers → seu app → WhatsApp → API Setup)
- `WHATSAPP_PHONE_NUMBER_ID`: Phone Number ID do número de WhatsApp Business conectado ao app

> ⚠️ O `WHATSAPP_TOKEN` gerado em "API Setup" é temporário (expira em ~24h). Para produção, gere um **token permanente** vinculado a um System User em Business Settings → System Users.

Na Vercel, configure as mesmas variáveis em **Project Settings → Environment Variables** antes do deploy.

### 3. Deploy na Vercel

```
npm install
vercel --prod
```

A URL do webhook será: `https://SEU-PROJETO.vercel.app/api/webhook`

### 4. Configurar no painel da Meta

Em **Configurar webhooks**:

- **URL de callback**: `https://SEU-PROJETO.vercel.app/api/webhook`
- **Verificar token**: o mesmo valor definido em `WEBHOOK_VERIFY_TOKEN`

A Meta faz uma chamada `GET` para validar o token antes de liberar o cadastro do webhook.

## Dados armazenados

- `contacts`: número/ID do WhatsApp e nome de perfil de quem envia mensagens
- `messages`: mensagens recebidas (texto, tipo, timestamp e payload bruto)
- `message_status_updates`: atualizações de status (enviado, entregue, lido, falhou)
- `conversation_states`: estado atual da conversa de cada contato
- `pickup_requests`: agendamentos confirmados de retirada de equipamento
