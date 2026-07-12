# MHZ_BOT_ZAP

Webhook para receber eventos do WhatsApp (Meta/Cloud API) e armazenar mensagens e status no Postgres (Supabase). Feito para deploy na Vercel (Serverless Functions).

## Estrutura

- `api/webhook.js` — endpoint do webhook (`GET` valida o token da Meta, `POST` recebe mensagens/status)
- `lib/db.js` — conexão e queries no Postgres
- `lib/whatsapp.js` — envio de mensagens (texto, botões, listas) via Graph API da Meta
- `lib/conversation.js` — máquina de estados do bot de atendimento
- `sql/schema.sql` — script para criar as tabelas no Supabase

## Bot de atendimento

Quando alguém manda uma saudação (oi, bom dia, boa tarde, etc.), o bot responde e oferece um menu com duas opções:

1. **Contratar internet** — encaminha para um consultor humano.
2. **Retirar equipamento** — inicia o agendamento:
   1. Escolha da data (hoje até 3 dias à frente)
   2. Escolha do período (manhã 08h-12h ou tarde 13h-18h)
   3. Confirmação do endereço de retirada
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
