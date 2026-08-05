// Pure RFC-4180 CSV builder for a Keyword Overview result set. The 12-month
// history becomes one column per (year, month), taken as the UNION across all
// rows and sorted, so every row aligns to the same columns (missing month =
// empty cell). null numerics emit empty string, never "null"/0.
import type { KeywordOverviewRow } from "@/lib/dataforseo/labs";

const monthKey = (m: { year: number; month: number }) => `${m.year}-${String(m.month).padStart(2, "0")}`;

function cell(v: string | number | null): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildKeywordCsv(rows: KeywordOverviewRow[]): string {
  const months = Array.from(new Set(rows.flatMap((r) => r.monthly.map(monthKey)))).sort();
  const header = ["Keyword", "Volume", "Difficulty", "CPC", "Competition", "Trend % (12mo)", ...months];
  const lines = [header.map(cell).join(",")];
  for (const r of rows) {
    const mv = new Map(r.monthly.map((m) => [monthKey(m), m.volume]));
    const cells = [
      r.keyword, r.searchVolume, r.difficulty, r.cpc, r.competition, r.trendPct,
      ...months.map((mk) => (mv.has(mk) ? (mv.get(mk) ?? null) : null)),
    ];
    lines.push(cells.map(cell).join(","));
  }
  return lines.join("\r\n");
}
