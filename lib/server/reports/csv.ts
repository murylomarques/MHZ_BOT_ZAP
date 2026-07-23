// Helper de CSV feito à mão (sem lib externa) — escapa vírgula, ponto-e-vírgula,
// aspas e quebras de linha conforme RFC 4180 simplificado.
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  function esc(v: string | number | null | undefined): string {
    const s = v === null || v === undefined ? "" : String(v);
    if (/["\n,;]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }
  const lines = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))];
  // BOM ajuda o Excel a reconhecer UTF-8 corretamente (acentos em pt-BR).
  return "﻿" + lines.join("\r\n");
}
