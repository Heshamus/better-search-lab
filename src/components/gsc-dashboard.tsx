import type { GscData } from "@/lib/google/store";
import { AreaTrend } from "@/components/charts";
import { formatCompact } from "@/lib/format";

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="panel flex flex-col gap-1.5 px-4 py-3.5">
      <span className="eyebrow">{label}</span>
      <span className="num text-[1.7rem] font-semibold leading-none tracking-tight text-white">{value}</span>
      <span className="text-[0.7rem] text-neutral-500">{hint}</span>
    </div>
  );
}

function shortPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname === "/" ? "/ (home)" : u.pathname;
  } catch {
    return url;
  }
}

/**
 * Google Search Console dashboard — the OWNER's real, free search performance:
 * clicks/impressions/CTR/position over 90 days, with the actual position trend
 * (the one the rank charts couldn't draw without history), plus top queries and
 * pages.
 */
export function GscDashboard({ data }: { data: GscData }) {
  const t = data.totals;
  const labels = data.daily.length ? [data.daily[0].date, data.daily[data.daily.length - 1].date] : [];

  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Clicks" value={formatCompact(t?.clicks ?? 0)} hint="last 90 days" />
        <Tile label="Impressions" value={formatCompact(t?.impressions ?? 0)} hint="last 90 days" />
        <Tile label="Avg CTR" value={`${((t?.ctr ?? 0) * 100).toFixed(1)}%`} hint="clicks ÷ impressions" />
        <Tile label="Avg position" value={t?.position ? t.position.toFixed(1) : "—"} hint="across queries" />
      </dl>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="panel flex flex-col gap-4 p-5">
          <h3 className="text-sm font-semibold text-white">Clicks over time</h3>
          <AreaTrend points={data.daily.map((d) => d.clicks)} labels={labels} color="var(--color-accent)" height={200} emptyLabel="No click data yet" />
        </div>
        <div className="panel flex flex-col gap-4 p-5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">Average position</h3>
            <span className="eyebrow">lower is better</span>
          </div>
          <AreaTrend
            points={data.daily.map((d) => d.position)}
            labels={labels}
            color="var(--color-series-2)"
            height={200}
            invert
            yFormat={(n) => n.toFixed(1)}
            emptyLabel="No position data yet"
          />
        </div>
      </div>

      <div className="panel overflow-x-auto">
        <div className="flex items-baseline justify-between gap-2 border-b border-neutral-800 px-4 py-2.5">
          <h3 className="text-sm font-semibold text-white">Rising queries</h3>
          <span className="eyebrow">last 28d vs prior · your demand accelerating</span>
        </div>
        <table className="w-full min-w-[360px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-800">
              <th className="eyebrow px-4 py-2.5">Query</th>
              <th className="eyebrow px-4 py-2.5">Your page</th>
              <th className="eyebrow px-4 py-2.5">Impr. (28d)</th>
              <th className="eyebrow px-4 py-2.5">Growth</th>
            </tr>
          </thead>
          <tbody>
            {data.risingQueries.length ? data.risingQueries.map((r) => (
              <tr key={r.query} className="border-b border-neutral-800/50 transition-colors last:border-0 hover:bg-neutral-800/20">
                <td className="px-4 py-2.5 font-medium text-white">{r.query}</td>
                <td className="px-4 py-2.5">
                  {r.page ? (
                    <span className="text-neutral-300" title={r.page}>{shortPath(r.page)}</span>
                  ) : (
                    <span className="rounded bg-at-risk/10 px-1.5 py-0.5 text-[0.66rem] font-medium text-at-risk">no page · gap</span>
                  )}
                </td>
                <td className="px-4 py-2.5"><span className="tnum text-neutral-200">{formatCompact(r.recent)}</span></td>
                <td className="px-4 py-2.5"><span className="tnum font-medium text-accent">▲ {formatCompact(r.delta)}{r.prior === 0 ? " · new" : ""}</span></td>
              </tr>
            )) : <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-neutral-500">No rising queries yet — they surface as demand for your topics accelerates.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="panel overflow-x-auto">
          <div className="border-b border-neutral-800 px-4 py-2.5"><h3 className="text-sm font-semibold text-white">Top queries</h3></div>
          <table className="w-full min-w-[360px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-800">
                <th className="eyebrow px-4 py-2.5">Query</th>
                <th className="eyebrow px-4 py-2.5">Clicks</th>
                <th className="eyebrow px-4 py-2.5">Impr.</th>
                <th className="eyebrow px-4 py-2.5">Pos</th>
              </tr>
            </thead>
            <tbody>
              {data.topQueries.length ? data.topQueries.map((r) => (
                <tr key={r.key} className="border-b border-neutral-800/50 transition-colors last:border-0 hover:bg-neutral-800/20">
                  <td className="px-4 py-2.5 font-medium text-white">{r.key}</td>
                  <td className="px-4 py-2.5"><span className="tnum text-neutral-200">{r.clicks}</span></td>
                  <td className="px-4 py-2.5"><span className="tnum text-neutral-400">{formatCompact(r.impressions)}</span></td>
                  <td className="px-4 py-2.5"><span className="tnum text-neutral-300">{r.position.toFixed(1)}</span></td>
                </tr>
              )) : <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-neutral-500">No query data yet.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="panel overflow-x-auto">
          <div className="border-b border-neutral-800 px-4 py-2.5"><h3 className="text-sm font-semibold text-white">Top pages</h3></div>
          <table className="w-full min-w-[360px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-800">
                <th className="eyebrow px-4 py-2.5">Page</th>
                <th className="eyebrow px-4 py-2.5">Clicks</th>
                <th className="eyebrow px-4 py-2.5">Impr.</th>
                <th className="eyebrow px-4 py-2.5">Pos</th>
              </tr>
            </thead>
            <tbody>
              {data.topPages.length ? data.topPages.map((r) => (
                <tr key={r.key} className="border-b border-neutral-800/50 transition-colors last:border-0 hover:bg-neutral-800/20">
                  <td className="px-4 py-2.5 font-medium text-white" title={r.key}>{shortPath(r.key)}</td>
                  <td className="px-4 py-2.5"><span className="tnum text-neutral-200">{r.clicks}</span></td>
                  <td className="px-4 py-2.5"><span className="tnum text-neutral-400">{formatCompact(r.impressions)}</span></td>
                  <td className="px-4 py-2.5"><span className="tnum text-neutral-300">{r.position.toFixed(1)}</span></td>
                </tr>
              )) : <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-neutral-500">No page data yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
