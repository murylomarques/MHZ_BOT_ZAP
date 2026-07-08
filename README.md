# MHZ_BOT_ZAP

Webhook para receber eventos do WhatsApp (Meta/Cloud API) e armazenar mensagens e status no Postgres (Supabase). Feito para deploy na Vercel (Serverless Functions).

## Estrutura

- `api/webhook.js` — endpoint do webhook (`GET` valida o token da Meta, `POST` recebe mensagens/status)
- `lib/db.js` — conexão e queries no Postgres
- `sql/schema.sql` — script para criar as tabelas no Supabase

## Configuração

### 1. Banco de dados

No SQL Editor do Supabase, rode o conteúdo de `sql/schema.sql` uma vez para criar as tabelas `contacts`, `messages` e `message_status_updates`.

### 2. Variáveis de ambiente

Copie `.env.example` para `.env` (uso local) e preencha:

- `DATABASE_URL`: string de conexão do Supabase (Settings → Database → Connection string)
- `WEBHOOK_VERIFY_TOKEN`: qualquer string secreta gerada por você, usada na verificação do webhook

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
