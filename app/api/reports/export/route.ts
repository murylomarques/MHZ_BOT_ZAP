import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/server/auth/rbac";
import { getReportData, isReportKey, parseDateRange } from "@/lib/server/reports/queries";
import { toCsv } from "@/lib/server/reports/csv";

// Export CSV — cap alto o bastante para cobrir a base inteira hoje (~7k casos)
// com folga, sem deixar uma exportação acidental travar a função serverless.
const EXPORT_LIMIT = 20000;

export async function GET(req: NextRequest) {
  try {
    await requirePermission("reports_export_all");

    const sp = req.nextUrl.searchParams;
    const reportParam = sp.get("report");
    if (!reportParam || !isReportKey(reportParam)) {
      return NextResponse.json({ error: "Relatório inválido" }, { status: 400 });
    }

    const range = parseDateRange(sp.get("from") ?? undefined, sp.get("to") ?? undefined);
    const { headers, rows } = await getReportData(reportParam, range, { limit: EXPORT_LIMIT });
    const csv = toCsv(headers, rows);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="relatorio-${reportParam}.csv"`,
      },
    });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
