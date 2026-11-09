import { getYearFinance } from "@/lib/data";

export async function GET(req: Request) {
  const ano = new URL(req.url).searchParams.get("ano");
  const year = ano && /^\d{4}$/.test(ano) ? Number(ano) : new Date().getFullYear();
  const rows = await getYearFinance(year);
  const lines = ["Mes;Contratos;Eventos;Receita total;Em atraso", ...rows.map((r) => [r.month, r.contracts, r.events, r.contracts + r.events, r.overdue].join(";"))];
  return new Response("\uFEFF" + lines.join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="relatorio-${year}.csv"` },
  });
}
