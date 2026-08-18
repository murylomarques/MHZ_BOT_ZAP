import { FatalError } from "workflow";

const CAMPAIGN_ID = "4b3dac15-12d3-46c3-98e2-19b33f4ac7bc";
const CAMPAIGN_NAME = "Disparo Backlog Regional Jundiai 3000 - 18-08-2026";
const HARD_LIMIT = 3000;
const CHUNK_SIZE = 20;

type DispatchResult = { attempted: number; sent: number; failed: number };

export async function scheduledVolunteerDispatch(campaignId: string): Promise<DispatchResult> {
  "use workflow";

  if (campaignId !== CAMPAIGN_ID) {
    throw new FatalError("Campanha não autorizada para este agendamento.");
  }

  const itemIds = await loadFrozenItemIds(campaignId);
  if (itemIds.length !== HARD_LIMIT) {
    throw new FatalError(`Lote bloqueado: esperado ${HARD_LIMIT}, encontrado ${itemIds.length}.`);
  }

  let attempted = 0;
  let sent = 0;
  let failed = 0;

  for (let offset = 0; offset < itemIds.length; offset += CHUNK_SIZE) {
    const result = await dispatchChunk(campaignId, itemIds.slice(offset, offset + CHUNK_SIZE));
    attempted += result.attempted;
    sent += result.sent;
    failed += result.failed;
  }

  await closeCampaign(campaignId);
  return { attempted, sent, failed };
}

async function createPool() {
  const { Pool } = await import("pg");
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 3,
  });
}

async function loadFrozenItemIds(campaignId: string): Promise<string[]> {
  "use step";
  console.log(`[scheduled-dispatch] START load campaign=${campaignId}`);
  const pool = await createPool();
  try {
    const { rows: campaigns } = await pool.query(
      `select id, name from bot_campaigns where id = $1 and name = $2`,
      [campaignId, CAMPAIGN_NAME]
    );
    if (!campaigns[0]) throw new FatalError("Campanha congelada não encontrada.");

    const { rows } = await pool.query(
      `select id from bot_campaign_items where campaign_id = $1 order by id`,
      [campaignId]
    );
    console.log(`[scheduled-dispatch] DONE load count=${rows.length}`);
    return rows.map((row) => row.id);
  } finally {
    await pool.end();
  }
}

async function dispatchChunk(campaignId: string, itemIds: string[]): Promise<DispatchResult> {
  "use step";
  console.log(`[scheduled-dispatch] START chunk size=${itemIds.length}`);
  const pool = await createPool();
  try {
    // Esta atualização é a trava principal: mesmo que o passo seja repetido,
    // somente itens ainda PENDENTE podem gerar uma chamada para a Meta.
    const { rows: claimed } = await pool.query(
      `update bot_campaign_items
          set status = 'PROCESSANDO', attempts = attempts + 1
        where campaign_id = $1 and id = any($2::uuid[]) and status = 'PENDENTE'
      returning id, case_id`,
      [campaignId, itemIds]
    );
    if (!claimed.length) return { attempted: 0, sent: 0, failed: 0 };

    const { rows } = await pool.query(
      `select bci.id as item_id, cr.id as case_id, c.phone, c.name,
              coalesce(bt.hsm_code, bt.flow_code, bt.internal_name) as template_name,
              bt.variables
         from bot_campaign_items bci
         join case_records cr on cr.id = bci.case_id
         join service_orders so on so.id = cr.service_order_id
         join customers c on c.id = so.customer_id
         join bot_campaigns bc on bc.id = bci.campaign_id
         join bot_templates bt on bt.id = bc.template_id
        where bci.campaign_id = $1 and bci.id = any($2::uuid[])`,
      [campaignId, claimed.map((item) => item.id)]
    );

    const results = await Promise.all(
      rows.map(async (row) => {
        const variables = Array.isArray(row.variables) ? row.variables : [];
        const parameters = variables
          .filter((name: string) => name === "nome" || name === "customer_name")
          .map((parameterName: string) => ({
            type: "text",
            parameter_name: parameterName,
            text: row.name,
          }));
        try {
          const response = await fetch(
            `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                messaging_product: "whatsapp",
                to: row.phone,
                type: "template",
                template: {
                  name: row.template_name,
                  language: { code: "pt_BR" },
                  components: parameters.length ? [{ type: "body", parameters }] : undefined,
                },
              }),
            }
          );
          const payload = await response.json().catch(() => ({}));
          return {
            ...row,
            success: response.ok,
            externalId: payload?.messages?.[0]?.id ?? null,
            errorCode: response.ok ? null : String(payload?.error?.code ?? response.status),
            errorMessage: response.ok ? null : String(payload?.error?.message ?? "Erro ao enviar"),
          };
        } catch (error) {
          return {
            ...row,
            success: false,
            externalId: null,
            errorCode: "NETWORK_ERROR",
            errorMessage: error instanceof Error ? error.message : "Erro de rede",
          };
        }
      })
    );

    const client = await pool.connect();
    try {
      await client.query("begin");
      for (const result of results) {
        await client.query(
          `insert into bot_messages
             (id, case_id, campaign_id, provider, external_id, direction, status,
              error_code, error_message, sent_at, created_at)
           values
             (gen_random_uuid(), $1, $2, 'meta_whatsapp', $3, 'outbound', $4,
              $5, $6, $7, now())`,
          [
            result.case_id,
            campaignId,
            result.externalId,
            result.success ? "ENVIADO" : "ERRO",
            result.errorCode,
            result.errorMessage,
            result.success ? new Date() : null,
          ]
        );
        await client.query(
          `update bot_campaign_items set status = $2 where id = $1 and status = 'PROCESSANDO'`,
          [result.item_id, result.success ? "ENVIADO" : "ERRO"]
        );
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    const sent = results.filter((result) => result.success).length;
    console.log(`[scheduled-dispatch] DONE attempted=${results.length} sent=${sent}`);
    return { attempted: results.length, sent, failed: results.length - sent };
  } finally {
    await pool.end();
  }
}

async function closeCampaign(campaignId: string): Promise<void> {
  "use step";
  console.log(`[scheduled-dispatch] START close campaign=${campaignId}`);
  const pool = await createPool();
  try {
    await pool.query(
      `update bot_campaigns set status = 'ENCERRADA', updated_at = now() where id = $1`,
      [campaignId]
    );
    console.log(`[scheduled-dispatch] DONE close campaign=${campaignId}`);
  } finally {
    await pool.end();
  }
}
