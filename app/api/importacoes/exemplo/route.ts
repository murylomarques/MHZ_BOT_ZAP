import { NextResponse } from "next/server";

// Colunas exigidas pelo importador (ver EXPECTED_HEADER em
// lib/server/import/csv-import.ts) — mantenha as duas listas em sincronia.
// Sem hsm/flow/status de disparo/erro: quem controla disparo é o sistema,
// a planilha só alimenta clientes/OS novos.
const HEADER = [
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

const EXAMPLE_ROWS = [
  [
    "1",
    "Campinas",
    "Rua das Flores, 123, Centro, Campinas",
    "Campinas",
    "SA-000123",
    "123456",
    "WO-000123",
    "João da Silva",
    "20/07/2026",
    "5519981541198",
  ],
  [
    "2",
    "Sorocaba",
    "",
    "Sorocaba",
    "SA-000124",
    "123457",
    "WO-000124",
    "Maria Souza",
    "21/07/2026",
    "5511999998888",
  ],
];

export async function GET() {
  const lines = [HEADER.join(";"), ...EXAMPLE_ROWS.map((r) => r.join(";"))];
  const csv = lines.join("\n") + "\n";

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="exemplo-base-importacao.csv"',
    },
  });
}
