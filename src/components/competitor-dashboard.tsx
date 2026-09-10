import { HBars } from "@/components/charts";
import { PositionBadge } from "@/components/viz";
import { formatCompact } from "@/lib/format";

export interface CompetitorStat {
  domain: string;
  keywords: number;
  avgPosition: number | null;
  volume: number;
}

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
 * Competitor comparison dashboard: how the tracked rivals stack up — footprint
 * (ranked keywords collected), combined reach, and the keyword-gap count — with
 * a share-of-voice chart and a reach table. Real data from `competitor_keywords`
 * (replaces the old "share of voice — coming soon" placeholder).
 */
export function CompetitorDashboard({ stats, gapCount }: { stats: CompetitorStat[]; gapCount: number }) {
  const ranked = [...stats].sort((a, b) => b.keywords - a.keywords);
  const totalKeywords = stats.reduce((s, c) => s + c.keywords, 0);
  const totalVolume = stats.reduce((s, c) => s + c.volume, 0);

  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Competitors" value={String(stats.length)} hint="tracked" />
        <Tile label="Keywords analyzed" value={formatCompact(totalKeywords)} hint="across rivals" />
        <Tile label="Combined reach" value={formatCompact(totalVolume)} hint="monthly search volume" />
        <Tile label="Keyword gaps" value={String(gapCount)} hint="they rank, you don't" />
      </dl>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="panel flex flex-col gap-4 p-5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-neutral-900">Share of voice</h3>
            <span className="eyebrow">ranked keywords</span>
          </div>
          <HBars
            items={ranked.map((c) => ({ label: c.domain, value: c.keywords }))}
            valueFormat={(n) => String(n)}
            color="var(--color-series-3)"
            emptyLabel="Refresh a competitor's intel to compare"
          />
        </div>

        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[380px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200">
                <th className="eyebrow px-4 py-2.5">Competitor</th>
                <th className="eyebrow px-4 py-2.5">Keywords</th>
                <th className="eyebrow px-4 py-2.5">Avg pos</th>
                <th className="eyebrow px-4 py-2.5">Reach</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((c) => (
                <tr key={c.domain} className="border-b border-neutral-200 transition-colors last:border-0 hover:bg-neutral-50">
                  <td className="px-4 py-2.5 font-medium text-neutral-900">{c.domain}</td>
                  <td className="px-4 py-2.5"><span className="tnum text-neutral-800">{c.keywords}</span></td>
                  <td className="px-4 py-2.5"><PositionBadge pos={c.avgPosition} /></td>
                  <td className="px-4 py-2.5"><span className="tnum text-neutral-700">{formatCompact(c.volume)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
