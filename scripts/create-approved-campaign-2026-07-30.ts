import "dotenv/config";
import crypto from "node:crypto";
import { prisma } from "../lib/server/db/prisma";

const IMPORT_BATCH_ID = "97ffcde9-bee1-46c0-8ae8-79fc07d4efe4";
const PREVIOUS_CAMPAIGN_ID = "222f7da6-71ff-4efd-8b79-a9897a71ca0c";
const TEMPLATE_ID = "00000000-0000-0000-0000-000000000010";
const CAMPAIGN_NAME = "Disparo Voluntarios 1000 - 30-07-2026 Agora";

const quotas: Record<string, number> = {
  Sorocaba: 140,
  Piracicaba: 113,
  "Francisco Morato": 101,
  Jundiai: 91,
  Indaiatuba: 84,
  Amparo: 64,
  Itu: 60,
  Hortolandia: 56,
  Caieiras: 48,
  Pedreira: 45,
  "Mogi Mirim": 40,
  "Mogi Guacu": 37,
  Salto: 36,
  Jaguariuna: 31,
  "Serra Negra": 22,
  "Santo Antonio de Posse": 12,
  Votorantim: 12,
  Holambra: 5,
  "Estiva Gerbi": 3,
};

type Candidate = {
  case_id: string;
  city: string;
  phone: string;
  data_abertura: string;
};

async function main() {
  const previous = await prisma.botCampaign.findFirst({ where: { name: CAMPAIGN_NAME } });
  if (previous) throw new Error(`Campanha já existe: ${previous.id}`);

  const candidates = await prisma.$queryRaw<Candidate[]>`
    with source as (
      select distinct on (ir.raw_data->>'sa_id')
             ir.raw_data->>'sa_id' as sa_id,
             ir.raw_data->>'cidade_normalizada' as city,
             case
               when coalesce(ir.raw_data->>'data_abertura', '') ~ '^\d{4}-\d{2}-\d{2}'
               then (ir.raw_data->>'data_abertura')::timestamptz
               when coalesce(ir.raw_data->>'data_abertura', '') ~ '^\d{2}/\d{2}/\d{4}$'
               then to_date(ir.raw_data->>'data_abertura', 'DD/MM/YYYY')::timestamptz
               else null
             end as data_abertura
        from import_rows ir
       where ir.import_batch_id = ${IMPORT_BATCH_ID}::uuid
         and ir.result in ('created', 'updated')
         and trim(coalesce(ir.raw_data->>'tipo_equipamento_retirado', '')) = 'Voluntário Total'
       order by ir.raw_data->>'sa_id', ir.row_number desc
    ),
    eligible as (
      select cr.id as case_id, source.city, c.phone, source.data_abertura,
             row_number() over (
               partition by source.city, c.phone
               order by source.data_abertura desc nulls last, source.sa_id
             ) as phone_rank
        from source
        join service_orders so on so.sa_id = source.sa_id
        join case_records cr on cr.service_order_id = so.id
        join customers c on c.id = so.customer_id
       where c.phone is not null
         and not exists (
           select 1
             from bot_campaign_items old_item
             join case_records old_cr on old_cr.id = old_item.case_id
             join service_orders old_so on old_so.id = old_cr.service_order_id
             join customers old_c on old_c.id = old_so.customer_id
            where old_item.campaign_id = ${PREVIOUS_CAMPAIGN_ID}::uuid
              and old_c.phone = c.phone
         )
    )
    select case_id, city, phone, data_abertura::text
      from eligible
     where phone_rank = 1
     order by city, data_abertura desc nulls last, case_id
  `;

  const selected: Candidate[] = [];
  const counts: Record<string, number> = {};
  for (const [city, quota] of Object.entries(quotas)) {
    const rows = candidates.filter((row) => row.city === city).slice(0, quota);
    if (rows.length !== quota) throw new Error(`${city}: esperado ${quota}, encontrado ${rows.length}`);
    selected.push(...rows);
    counts[city] = rows.length;
  }

  if (selected.length !== 1000) throw new Error(`Trava: esperado 1000, encontrado ${selected.length}`);
  if (new Set(selected.map((row) => row.phone)).size !== 1000) {
    throw new Error("Trava: o lote contém telefones duplicados entre cidades.");
  }

  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@mhzretira.com" } });
  const campaignId = crypto.randomUUID();

  await prisma.$transaction(async (tx) => {
    await tx.botCampaign.create({
      data: {
        id: campaignId,
        name: CAMPAIGN_NAME,
        templateId: TEMPLATE_ID,
        status: "RASCUNHO",
        cities: Object.keys(quotas),
        maxSendPerRun: 1000,
        maxAttempts: 1,
        createdByUserId: admin.id,
      },
    });
    await tx.botCampaignItem.createMany({
      data: selected.map((row) => ({
        campaignId,
        caseId: row.case_id,
        status: "PENDENTE",
        attempts: 0,
      })),
    });
  });

  console.log(JSON.stringify({ campaignId, total: selected.length, uniquePhones: 1000, counts }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
