import { Donut } from "@/components/charts";
import { Delta } from "@/components/viz";
import type { RankingRow } from "@/lib/rankings";

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="panel flex flex-col gap-1.5 px-4 py-3.5">
      <span className="eyebrow">{label}</span>
      <span className="num text-[1.7rem] font-semibold leading-none tracking-tight text-neutral-900">{value}</span>
      <span className="text-[0.7rem] text-neutral-500">{hint}</span>
    </div>
  );
}

/**
 * Rankings summary above the keyword table: how the tracked set sits in the
 * SERPs (position distribution + top-3 + average position) and the biggest
 * 7-day movers. Derived from the same `RankingRow[]` the table renders.
 */
export function RankingsSummary({ rows }: { rows: RankingRow[] }) {
  const rank = (r: RankingRow) => (r.fetchStatus === "ok" ? r.rankAbsolute : null);
  let top3 = 0, page1 = 0, page2 = 0, deep = 0, unranked = 0;
  for (const r of rows) {
    const p = rank(r);
    if (p == null) unranked++;
    else if (p <= 3) top3++;
    else if (p <= 10) page1++;
    else if (p <= 20) page2++;
    else if (p <= 100) deep++;
    else unranked++;
  }
  const rankedPositions = rows.map(rank).filter((p): p is number => p != null);
  const avgPos = rankedPositions.length ? Math.round(rankedPositions.reduce((s, p) => s + p, 0) / rankedPositions.length) : null;

  const segments = [
    { label: "Top 3", value: top3, color: "var(--color-up)" },
    { label: "Page 1 (4–10)", value: page1, color: "var(--color-accent)" },
    { label: "Page 2 (11–20)", value: page2, color: "var(--color-at-risk)" },
    { label: "21–100", value: deep, color: "var(--color-series-3)" },
    { label: "Unranked", value: unranked, color: "var(--color-neutral-700)" },
  ];

  const movers = rows
    .filter((r) => r.delta7 != null && r.delta7 !== 0)
    .sort((a, b) => Math.abs(b.delta7 as number) - Math.abs(a.delta7 as number))
    .slice(0, 6);

  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Tracked" value={String(rows.length)} hint="keywords" />
        <Tile label="Ranked" value={String(rankedPositions.length)} hint="in top 100" />
        <Tile label="Top 3" value={String(top3)} hint="best positions" />
        <Tile label="Avg position" value={avgPos != null ? String(avgPos) : "—"} hint="where ranked" />
      </dl>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="panel flex flex-col gap-4 p-5">
          <h3 className="text-sm font-semibold text-neutral-900">Position distribution</h3>
          <Donut segments={segments} centerLabel="keywords" />
        </div>

        <div className="panel flex flex-col gap-3 p-5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-neutral-900">Top movers</h3>
            <span className="eyebrow">last 7 days</span>
          </div>
          {movers.length ? (
            <ul className="flex flex-col">
              {movers.map((m) => (
                <li key={m.keywordId} className="flex items-center justify-between gap-3 border-b border-neutral-200 py-2 text-sm last:border-0">
                  <span className="truncate text-neutral-800">{m.keyword}</span>
                  <Delta value={m.delta7} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-neutral-300 py-8 text-xs text-neutral-600">
              No movement yet — check back after the next refresh
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
