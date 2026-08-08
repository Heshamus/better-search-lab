import type { GaData } from "@/lib/google/store";
import { Donut } from "@/components/charts";
import { TrendCard } from "@/components/trend-card";
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
  if (!url) return "(not set)";
  try {
    const u = url.startsWith("http") ? new URL(url) : null;
    const path = u ? u.pathname : url;
    return path === "/" ? "/ (home)" : path;
  } catch {
    return url;
  }
}

// Non-organic channels cycle through the series palette; Organic Search always
// gets the accent — it's the channel an SEO tool is actually about.
const OTHER_COLORS = ["var(--color-series-2)", "var(--color-series-3)", "var(--color-series-4)", "var(--color-series-1)"];

/**
 * Google Analytics 4 dashboard — the OWNER's real traffic: sessions/users/
 * engagement over 90 days, the session trend, the channel mix (Organic vs the
 * rest), and the top organic landing pages.
 */
export function GaDashboard({ data }: { data: GaData }) {
  const t = data.totals;
  const labels = data.daily.length ? [data.daily[0].date, data.daily[data.daily.length - 1].date] : [];

  let other = 0;
  const segments = data.channels.map((c) => ({
    label: c.channel,
    value: c.sessions,
    color: /organic/i.test(c.channel) ? "var(--color-accent)" : OTHER_COLORS[other++ % OTHER_COLORS.length],
  }));

  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Sessions" value={formatCompact(t?.sessions ?? 0)} hint="last 90 days" />
        <Tile label="Users" value={formatCompact(t?.users ?? 0)} hint="last 90 days" />
        <Tile label="Engagement" value={`${((t?.engagementRate ?? 0) * 100).toFixed(1)}%`} hint="engaged ÷ sessions" />
        <Tile label="Conversions" value={formatCompact(t?.conversions ?? 0)} hint="key events, 90 days" />
      </dl>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TrendCard title="Sessions over time" points={data.daily.map((d) => d.sessions)} labels={labels} format={formatCompact} emptyLabel="No session data yet" />
        <div className="panel flex flex-col gap-4 p-5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">Traffic by channel</h3>
            <span className="eyebrow">organic in green</span>
          </div>
          {segments.length ? (
            <Donut segments={segments} centerLabel="sessions" />
          ) : (
            <div className="flex h-[168px] items-center justify-center text-xs text-neutral-600">No channel data yet</div>
          )}
        </div>
      </div>

      <div className="panel overflow-x-auto">
        <div className="border-b border-neutral-800 px-4 py-2.5"><h3 className="text-sm font-semibold text-white">Top landing pages</h3></div>
        <table className="w-full min-w-[360px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-800">
              <th className="eyebrow px-4 py-2.5">Landing page</th>
              <th className="eyebrow px-4 py-2.5">Sessions</th>
            </tr>
          </thead>
          <tbody>
            {data.topPages.length ? data.topPages.map((r) => (
              <tr key={r.page} className="border-b border-neutral-800/50 transition-colors last:border-0 hover:bg-neutral-800/20">
                <td className="px-4 py-2.5 font-medium text-white" title={r.page}>{shortPath(r.page)}</td>
                <td className="px-4 py-2.5"><span className="tnum text-neutral-200">{formatCompact(r.sessions)}</span></td>
              </tr>
            )) : <tr><td colSpan={2} className="px-4 py-6 text-center text-sm text-neutral-500">No landing-page data yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
