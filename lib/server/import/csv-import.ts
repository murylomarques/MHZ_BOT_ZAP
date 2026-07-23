import crypto from "node:crypto";
import { prisma } from "../db/prisma";
import type { CaseStatus } from "@prisma/client";

// Mesma lista usada em lib/server/bot/cities.ts (duplicada por baixo
// acoplamento — ver comentário lá) — mantém as duas em sincronia. Cidades
// aqui usam o texto já sem acento, igual a coluna cidade_normalizada da base.
const KNOWN_CITIES = new Set([
  "Amparo",
  "Aracariguama",
  "Araras",
  "Atibaia",
  "Boituva",
  "Bom Jesus Dos Perdoes",
  "Cabreuva",
  "Caieiras",
  "Campinas",
  "Campo Limpo Paulista",
  "Capela Do Alto",
  "Francisco Morato",
  "Franco Da Rocha",
  "Hortolandia",
  "Indaiatuba",
  "Ipero",
  "Itu",
  "Itupeva",
  "Jaguariuna",
  "Jarinu",
  "Jundiai",
  "Leme",
  "Louveira",
  "Mairipora",
  "Nazare Paulista",
  "Pedreira",
  "Piracaia",
  "Piracicaba",
  "Rio Claro",
  "Salto",
  "Santo Antonio De Posse",
  "Serra Negra",
  "Sorocaba",
  "Sumare",
  "Tatui",
  "Valinhos",
  "Varzea Paulista",
  "Vinhedo",
  "Votorantim",
]);

// Comparação por nome de cidade é sem distinguir maiúsculas/minúsculas —
// exports diferentes já vieram com "Franco da Rocha" numa base e
// "Franco Da Rocha" noutra; não faz sentido tratar isso como cidade nova.
const KNOWN_CITIES_LOWER = new Set(Array.from(KNOWN_CITIES).map((c) => c.toLowerCase()));
function isKnownCity(city: string): boolean {
  return KNOWN_CITIES_LOWER.has(city.toLowerCase());
}

// Colunas exigidas na base de importação. Não inclui mais hsm/flow/status de
// disparo/erro de disparo/telefone_duplicado_na_fila — quem controla disparo,
// template usado e duplicidade de telefone é o próprio sistema (campanhas),
// não a planilha importada. A planilha só alimenta clientes/OS novos.
const EXPECTED_HEADER = [
  "ordem_fila",
  "cidade_normalizada",
  "endereco_completo",
  "cidade_original",
  "sa_id",
  "sa_number",
  "wo_number",
  "customer_name",
  "wo_scheduled_date",
  "telefone",
];

// Variações de nome de coluna conhecidas na base real (ex.: "enrereco
// completo", com espaço e erro de digitação) — normalizadas para o nome
// canônico acima.
const HEADER_ALIASES: Record<string, string> = {
  enrereco_completo: "endereco_completo",
};

type CsvRow = Record<string, string>;

function detectDelimiter(headerLine: string): string {
  const semicolons = (headerLine.match(/;/g) || []).length;
  const commas = (headerLine.match(/,/g) || []).length;
  return semicolons > commas ? ";" : ",";
}

function normalizeHeaderCell(h: string): string {
  const cleaned = h.trim().toLowerCase().replace(/\s+/g, "_");
  return HEADER_ALIASES[cleaned] ?? cleaned;
}

// Tokenizador de CSV de verdade (respeita aspas): células podem vir entre
// aspas (com "" representando uma aspa literal dentro do valor) e podem até
// conter o próprio delimitador — um split ingênuo quebraria nesses casos.
function parseCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

// Excel/Sheets às vezes exporta números que precisam preservar zero à
// esquerda (ex: wo_number) como fórmula de texto forçado: ="03134270". Depois
// do parser de CSV isso já vem sem as aspas externas, mas ainda embrulhado em
// ="...". Desembrulha para o valor real.
function unwrapExcelFormulaText(value: string): string {
  const match = value.match(/^="(.*)"$/);
  return match ? match[1] : value;
}

function parseCsv(content: string): { header: string[]; rows: CsvRow[] } {
  const normalized = content.replace(/^﻿/, "");
  const lines = normalized.split(/\r?\n/).filter((l) => l.length > 0);
  const delimiter = detectDelimiter(lines[0]);
  const header = parseCsvLine(lines[0], delimiter).map(normalizeHeaderCell);
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i], delimiter);
    const row: CsvRow = {};
    header.forEach((h, idx) => {
      if (!h) return; // colunas sem nome (vestigiais, ex. antigas colunas de hsm/flow em branco)
      row[h] = unwrapExcelFormulaText((cells[idx] ?? "").trim());
    });
    rows.push(row);
  }
  return { header, rows };
}

// Detecta telefone em notação científica (ex: "5,52E+12") — sinal de que a
// coluna foi aberta/exportada de uma planilha com formato numérico e perdeu
// dígitos de precisão. Não há como recuperar o telefone original nesse caso.
function isScientificNotation(value: string): boolean {
  return /\d[.,]?\d*e[+-]?\d+/i.test(value);
}

function normalizePhone(raw: string): { phone: string | null; error: string | null } {
  const trimmed = (raw || "").trim();
  if (!trimmed) return { phone: null, error: "Telefone vazio" };
  if (isScientificNotation(trimmed)) {
    return {
      phone: null,
      error:
        `Telefone em notação científica (${trimmed}) — a coluna foi aberta/exportada como número em planilha e ` +
        "perdeu dígitos. Reexporte a base com a coluna telefone formatada como texto.",
    };
  }
  const digits = trimmed.replace(/\D/g, "");
  if (!/^\d{12,13}$/.test(digits)) {
    return { phone: null, error: `Telefone inválido: ${trimmed}` };
  }
  return { phone: digits, error: null };
}

// wo_scheduled_date vem no formato brasileiro dd/mm/aaaa — new Date(string)
// interpretaria como mm/dd/aaaa e erraria mês e dia.
function parseBrazilianDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    const d = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const iso = new Date(value);
  return Number.isNaN(iso.getTime()) ? null : iso;
}

export type ImportSummary = {
  batchId: string;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  ignoredCount: number;
  invalidCount: number;
  duplicatePhoneCount: number;
  duplicateSaCount: number;
  duplicateWoCount: number;
  unknownCityCount: number;
  invalidPhoneCount: number;
  removedCount: number;
  // Volumetria: quantos casos ativos (não cancelados) existiam antes e depois
  // dessa importação — pra ficar claro se entrou algo novo de verdade ou não,
  // sem precisar adivinhar a partir dos contadores individuais.
  activeBeforeCount: number;
  activeAfterCount: number;
};

// Status que ainda não viraram um agendamento/retirada de verdade por nós —
// se o caso sumir da base importada nesse ponto, é seguro assumir que foi
// resolvido por fora (ex: concorrente já retirou o equipamento, ou a
// operadora deu baixa direto) e cancelar. A partir de AGENDADO em diante
// (e CLIENTE_RETIDO) o caso já é "nosso" e nunca é removido só por ausência
// na planilha. Isso só é seguro porque a planilha é sempre o retrato
// completo do que ainda está pendente na operadora (confirmado com o negócio).
const REMOVABLE_IF_MISSING_STATUSES: CaseStatus[] = [
  "IMPORTADO",
  "PENDENTE_DISPARO",
  "PROCESSANDO_DISPARO",
  "MENSAGEM_ENVIADA",
  "MENSAGEM_ENTREGUE",
  "MENSAGEM_LIDA",
  "AGUARDANDO_RESPOSTA",
  "CLIENTE_RESPONDEU",
  "ENDERECO_CONFIRMADO",
  "ENDERECO_DIVERGENTE",
  "ATENDIMENTO_HUMANO",
  "EM_ATENDIMENTO",
  "AGUARDANDO_AGENDAMENTO",
  "CONTATO_INVALIDO",
];

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

type ImportRowResult = { rowNumber: number; saId: string | null; result: "created" | "updated" | "invalid" | "ignored"; rawData: CsvRow };

export async function runCsvImport(params: {
  fileName: string;
  content: string;
  importedByUserId: string;
  // Se já existe um lote criado antecipadamente (fluxo assíncrono da rota
  // /api/import, que cria o registro e responde na hora pro usuário poder
  // acompanhar progresso), reusa em vez de criar outro.
  existingBatchId?: string;
}): Promise<ImportSummary> {
  const fileHash = crypto.createHash("sha256").update(params.content).digest("hex");
  const { header, rows } = parseCsv(params.content);

  const missingCols = EXPECTED_HEADER.filter((c) => !header.includes(c));
  if (missingCols.length > 0) {
    throw new Error(`CSV não tem as colunas esperadas: ${missingCols.join(", ")}`);
  }

  const activeBeforeCount = await prisma.caseRecord.count({ where: { status: { not: "CANCELADO" } } });

  const batch = params.existingBatchId
    ? await prisma.importBatch.update({
        where: { id: params.existingBatchId },
        data: { totalRows: rows.length, fileHash },
      })
    : await prisma.importBatch.create({
        data: {
          fileName: params.fileName,
          fileHash,
          importedByUserId: params.importedByUserId,
          totalRows: rows.length,
          status: "PROCESSANDO",
        },
      });

  // Throttle das atualizações de progresso — grava no banco no máximo 1x/s,
  // pra não virar mais uma fonte de contenção de conexão durante o import.
  let lastProgressWriteAt = 0;
  async function reportProgress(data: { createdCount?: number; updatedCount?: number; removedCount?: number }) {
    const now = Date.now();
    if (now - lastProgressWriteAt < 1000) return;
    lastProgressWriteAt = now;
    await prisma.importBatch.update({ where: { id: batch.id }, data }).catch(() => {});
  }

  const importErrors: { rowNumber: number; message: string }[] = [];
  const importRowResults: ImportRowResult[] = [];

  const seenSa = new Set<string>();
  const seenWo = new Set<string>();
  const phoneOccurrences = new Map<string, number>();
  let duplicateSaCount = 0;
  let duplicateWoCount = 0;
  let unknownCityCount = 0;
  let invalidPhoneCount = 0;

  type ValidRow = {
    rowNumber: number;
    saId: string;
    phone: string;
    city: string;
    address: string | null;
    row: CsvRow;
    scheduledDate: Date | null;
  };
  const validRows: ValidRow[] = [];

  rows.forEach((row, i) => {
    const rowNumber = i + 2;
    const saId = row.sa_id?.trim();
    // Algumas bases trazem telefone_limpo (já sem formatação/fórmula do
    // Excel) além de telefone — prefere o limpo quando existir.
    const phoneRaw = (row.telefone_limpo || row.telefone)?.trim();
    const city = row.cidade_normalizada?.trim();

    if (!saId || !phoneRaw || !row.customer_name) {
      importErrors.push({ rowNumber, message: "Campos obrigatórios ausentes (sa_id, telefone ou customer_name)" });
      importRowResults.push({ rowNumber, saId: saId ?? null, result: "invalid", rawData: row });
      return;
    }

    if (seenSa.has(saId)) duplicateSaCount++;
    seenSa.add(saId);
    if (row.wo_number) {
      if (seenWo.has(row.wo_number)) duplicateWoCount++;
      seenWo.add(row.wo_number);
    }
    if (city && !isKnownCity(city)) unknownCityCount++;

    const { phone, error } = normalizePhone(phoneRaw);
    if (!phone) {
      invalidPhoneCount++;
      importErrors.push({ rowNumber, message: error ?? `Telefone inválido: ${phoneRaw}` });
      importRowResults.push({ rowNumber, saId, result: "invalid", rawData: row });
      return;
    }
    phoneOccurrences.set(phone, (phoneOccurrences.get(phone) ?? 0) + 1);

    validRows.push({
      rowNumber,
      saId,
      phone,
      city,
      address: row.endereco_completo || null,
      row,
      scheduledDate: parseBrazilianDate(row.wo_scheduled_date),
    });
  });

  const duplicatePhoneCount = validRows.filter((v) => (phoneOccurrences.get(v.phone) ?? 0) > 1).length;

  // O mesmo sa_id pode aparecer mais de uma vez no próprio arquivo (fila
  // reprocessada). Mantém só a última ocorrência para criar/atualizar; as
  // anteriores contam como ignoradas (já contabilizadas em duplicateSaCount).
  const lastOccurrenceBySa = new Map<string, ValidRow>();
  for (const v of validRows) lastOccurrenceBySa.set(v.saId, v);
  const dedupedRows = Array.from(lastOccurrenceBySa.values());
  for (const v of validRows) {
    if (lastOccurrenceBySa.get(v.saId) !== v) {
      importRowResults.push({ rowNumber: v.rowNumber, saId: v.saId, result: "ignored", rawData: v.row });
    }
  }

  // Descobre em lote quais SA já existem, para separar create de update sem
  // um round-trip por linha.
  const existingBySa = new Map<
    string,
    { serviceOrderId: string; customerId: string; caseId: string | null; hasAddress: boolean }
  >();
  for (const saIdChunk of chunk(dedupedRows.map((v) => v.saId), 5000)) {
    const found = await prisma.serviceOrder.findMany({
      where: { saId: { in: saIdChunk } },
      select: {
        id: true,
        saId: true,
        customerId: true,
        caseRecord: { select: { id: true } },
        customer: { select: { addresses: { select: { id: true }, take: 1 } } },
      },
    });
    for (const f of found) {
      existingBySa.set(f.saId, {
        serviceOrderId: f.id,
        customerId: f.customerId,
        caseId: f.caseRecord?.id ?? null,
        hasAddress: f.customer.addresses.length > 0,
      });
    }
  }

  const toCreate = dedupedRows.filter((v) => !existingBySa.has(v.saId));
  const toUpdate = dedupedRows.filter((v) => existingBySa.has(v.saId));

  // ---- Criação em lote ----
  const customerRows = toCreate.map((v) => ({
    id: crypto.randomUUID(),
    name: v.row.customer_name,
    phone: v.phone,
    city: v.city || "DESCONHECIDA",
    cityOriginal: v.row.cidade_original || null,
  }));
  const serviceOrderRows = toCreate.map((v, idx) => ({
    id: crypto.randomUUID(),
    customerId: customerRows[idx].id,
    saId: v.saId,
    saNumber: v.row.sa_number || null,
    woNumber: v.row.wo_number || null,
    woScheduledDate: v.scheduledDate,
    importBatchId: batch.id,
    phoneDuplicateFlag: (phoneOccurrences.get(v.phone) ?? 0) > 1,
  }));
  // Todo caso novo entra pronto para o sistema decidir quando/como disparar
  // (campanhas) — a planilha não traz mais status de disparo.
  const caseRecordRows = toCreate.map((v, idx) => ({
    id: crypto.randomUUID(),
    serviceOrderId: serviceOrderRows[idx].id,
    status: "PENDENTE_DISPARO" as CaseStatus,
  }));
  const addressRows = toCreate
    .map((v, idx) => ({ v, customerId: customerRows[idx].id }))
    .filter(({ v }) => v.address)
    .map(({ v, customerId }) => ({
      id: crypto.randomUUID(),
      customerId,
      kind: "original",
      fullAddress: v.address as string,
    }));

  for (const c of chunk(customerRows, 2000)) {
    await prisma.customer.createMany({ data: c });
  }
  for (const c of chunk(serviceOrderRows, 2000)) {
    await prisma.serviceOrder.createMany({ data: c });
  }
  for (const c of chunk(caseRecordRows, 2000)) {
    await prisma.caseRecord.createMany({ data: c });
  }
  for (const c of chunk(addressRows, 2000)) {
    await prisma.customerAddress.createMany({ data: c });
  }

  toCreate.forEach((v) => {
    importRowResults.push({ rowNumber: v.rowNumber, saId: v.saId, result: "created", rawData: v.row });
  });
  await prisma.importBatch.update({ where: { id: batch.id }, data: { createdCount: toCreate.length } });

  // ---- Atualização em lote (uma query por campo-conjunto pra milhares de
  // linhas, em vez de duas idas ao banco POR LINHA) — com 18k+ registros
  // existentes, fazer update um a um significava minutos de ida-e-volta de
  // rede pro banco; usando unnest() como tabela derivada, tudo vira uma
  // única query por lote de 5000.
  for (const c of chunk(toUpdate, 5000)) {
    const customerIds: string[] = [];
    const names: string[] = [];
    const phones: string[] = [];
    const cities: string[] = [];
    const citiesOriginal: (string | null)[] = [];
    const soIds: string[] = [];
    const saNumbers: (string | null)[] = [];
    const woNumbers: (string | null)[] = [];
    const scheduledDates: (Date | null)[] = [];
    const phoneDuplicateFlags: boolean[] = [];

    for (const v of c) {
      const existing = existingBySa.get(v.saId)!;
      customerIds.push(existing.customerId);
      names.push(v.row.customer_name);
      phones.push(v.phone);
      cities.push(v.city || "DESCONHECIDA");
      citiesOriginal.push(v.row.cidade_original || null);
      soIds.push(existing.serviceOrderId);
      saNumbers.push(v.row.sa_number || null);
      woNumbers.push(v.row.wo_number || null);
      scheduledDates.push(v.scheduledDate);
      phoneDuplicateFlags.push((phoneOccurrences.get(v.phone) ?? 0) > 1);
    }

    await prisma.$executeRaw`
      UPDATE customers cu
      SET name = v.name, phone = v.phone, city = v.city, city_original = v.city_original, updated_at = now()
      FROM unnest(
        ${customerIds}::uuid[], ${names}::text[], ${phones}::text[], ${cities}::text[], ${citiesOriginal}::text[]
      ) AS v(customer_id, name, phone, city, city_original)
      WHERE cu.id = v.customer_id
    `;

    await prisma.$executeRaw`
      UPDATE service_orders so
      SET sa_number = v.sa_number, wo_number = v.wo_number, wo_scheduled_date = v.wo_scheduled_date,
          phone_duplicate_flag = v.phone_duplicate_flag, updated_at = now()
      FROM unnest(
        ${soIds}::uuid[], ${saNumbers}::text[], ${woNumbers}::text[], ${scheduledDates}::timestamp[],
        ${phoneDuplicateFlags}::boolean[]
      ) AS v(so_id, sa_number, wo_number, wo_scheduled_date, phone_duplicate_flag)
      WHERE so.id = v.so_id
    `;

    // Só grava endereço se o cliente ainda não tiver nenhum registrado —
    // evita empilhar duplicata a cada reimportação do mesmo arquivo. Nunca
    // mexe no status do caso (o progresso do atendimento é preservado).
    const newAddresses = c
      .filter((v) => v.address && !existingBySa.get(v.saId)!.hasAddress)
      .map((v) => ({
        id: crypto.randomUUID(),
        customerId: existingBySa.get(v.saId)!.customerId,
        kind: "original",
        fullAddress: v.address as string,
      }));
    if (newAddresses.length > 0) {
      await prisma.customerAddress.createMany({ data: newAddresses });
    }

    c.forEach((v) => {
      importRowResults.push({ rowNumber: v.rowNumber, saId: v.saId, result: "updated", rawData: v.row });
    });
    await reportProgress({ updatedCount: importRowResults.filter((r) => r.result === "updated").length });
  }
  await prisma.importBatch.update({ where: { id: batch.id }, data: { updatedCount: toUpdate.length } });

  // ---- Remove (cancela) casos que sumiram da base e ainda não foram
  // agendados/retirados por nós — provável retirada por concorrente ou baixa
  // externa. Uma única query (CTE + UPDATE) evita depender de tabela
  // temporária de sessão, que não é segura com o pooler em modo transação.
  // NOT EXISTS sobre um unnest() deixa o Postgres construir uma tabela hash
  // do array pra fazer um hash anti-join — muito mais rápido que "<> ALL"
  // (que tende a virar comparação item a item) quando o array tem dezenas
  // de milhares de elementos, como numa base grande.
  const currentSaIds = dedupedRows.map((v) => v.saId);
  const cancelled = await prisma.$queryRaw<{ id: string; fromStatus: CaseStatus }[]>`
    WITH candidates AS (
      SELECT cr.id, cr.status AS from_status
      FROM case_records cr
      JOIN service_orders so ON so.id = cr.service_order_id
      WHERE cr.status = ANY(${REMOVABLE_IF_MISSING_STATUSES}::"CaseStatus"[])
        AND NOT EXISTS (
          SELECT 1 FROM unnest(${currentSaIds}::text[]) AS cur(sa_id) WHERE cur.sa_id = so.sa_id
        )
    )
    UPDATE case_records cr
    SET status = 'CANCELADO', updated_at = now()
    FROM candidates c
    WHERE cr.id = c.id
    RETURNING cr.id, c.from_status AS "fromStatus"
  `;
  if (cancelled.length > 0) {
    for (const c of chunk(cancelled, 2000)) {
      await prisma.caseStatusHistory.createMany({
        data: c.map((row) => ({
          caseId: row.id,
          fromStatus: row.fromStatus,
          toStatus: "CANCELADO" as CaseStatus,
          origin: "IMPORTACAO" as const,
          reason: "Não aparece mais na base importada — provável retirada por concorrente ou baixa externa",
        })),
      });
    }
  }
  const removedCount = cancelled.length;

  // ---- Persistência dos registros de auditoria da importação, em lote ----
  for (const c of chunk(importErrors, 2000)) {
    await prisma.importError.createMany({ data: c.map((e) => ({ importBatchId: batch.id, ...e })) });
  }
  for (const c of chunk(importRowResults, 2000)) {
    await prisma.importRow.createMany({ data: c.map((r) => ({ importBatchId: batch.id, ...r })) });
  }

  const createdCount = toCreate.length;
  const updatedCount = toUpdate.length;
  const invalidCount = rows.length - validRows.length;
  const ignoredCount = validRows.length - dedupedRows.length;
  const activeAfterCount = await prisma.caseRecord.count({ where: { status: { not: "CANCELADO" } } });

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      createdCount,
      updatedCount,
      ignoredCount,
      invalidCount,
      duplicatePhoneCount,
      duplicateSaCount,
      duplicateWoCount,
      unknownCityCount,
      invalidPhoneCount,
      removedCount,
      status: "CONCLUIDO",
      finishedAt: new Date(),
    },
  });

  return {
    batchId: batch.id,
    totalRows: rows.length,
    createdCount,
    updatedCount,
    ignoredCount,
    invalidCount,
    duplicatePhoneCount,
    duplicateSaCount,
    duplicateWoCount,
    unknownCityCount,
    invalidPhoneCount,
    removedCount,
    activeBeforeCount,
    activeAfterCount,
  };
}
