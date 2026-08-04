import type { UsageSummary } from "@/lib/usage";
import { AreaTrend, HBars } from "@/components/charts";

function usd(n: number): string {
  return `$${n.toFixed(2)}`;
}

// "/v3/dataforseo_labs/google/keyword_ideas/live" → "keyword_ideas";
// "deepseek/v4-pro/chat" → "deepseek chat" — a readable label for the chart.
function shortEndpoint(ep: string): string {
  if (ep.startsWith("deepseek")) return "deepseek chat";
  const parts = ep.split("/").filter(Boolean);
  const i = parts.indexOf("google");
  return (i >= 0 ? parts[i + 1] : parts[parts.length - 2]) ?? ep;
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="panel flex flex-col gap-1.5 px-4 py-3.5">
      <span className="eyebrow">{label}</span>
      <span className="num text-[1.7rem] font-semibold leading-none tracking-tight text-white">{value}</span>
      <span className="text-[0.7rem] text-neutral-500">{hint}</span>
    </div>
  );
}

/**
 * Usage & cost dashboard: headline totals, spend-over-time trend, and a
 * cost-by-endpoint breakdown (bars + detail table). Pure display over
 * `usageSummary`. A genuinely empty month renders a real "$0.00", never a blank
 * page or a fabricated number.
 */
export function UsageReport({ summary }: { summary: UsageSummary }) {
  const isEmpty = summary.byDay.length === 0 && summary.byEndpoint.length === 0;
  const totalRows = summary.byEndpoint.reduce((s, e) => s + e.rows, 0);
  const days = summary.byDay.length;
  const byEndpoint = [...summary.byEndpoint].sort((a, b) => b.cost - a.cost);

  if (isEmpty) {
    return (
      <div className="panel px-6 py-16 text-center">
        <p className="num text-2xl font-semibold text-white">$0.00</p>
        <p className="mt-1.5 text-sm text-neutral-400">No usage yet this month.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Total spend" value={usd(summary.total)} hint="this month" />
        <Tile label="Days active" value={String(days)} hint="with usage" />
        <Tile label="API calls" value={Intl.NumberFormat("en", { notation: "compact" }).format(totalRows)} hint="rows billed" />
        <Tile label="Avg / day" value={usd(days ? summary.total / days : 0)} hint="mean daily spend" />
      </dl>

      <div className="panel flex flex-col gap-4 p-5">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-white">Spend over time</h3>
          <span className="eyebrow">{days === 1 ? "1 day" : `${days} days`}</span>
        </div>
        <AreaTrend
          points={summary.byDay.map((d) => d.cost)}
          labels={days ? [summary.byDay[0].day, summary.byDay[days - 1].day] : []}
          yFormat={usd}
          color="var(--color-series-2)"
          height={200}
          emptyLabel="Only one day of usage so far — the trend fills in daily"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="panel flex flex-col gap-4 p-5">
          <h3 className="text-sm font-semibold text-white">Cost by endpoint</h3>
          <HBars items={byEndpoint.map((e) => ({ label: shortEndpoint(e.endpoint), value: e.cost }))} valueFormat={usd} color="var(--color-series-4)" />
        </div>

        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-800">
                <th className="eyebrow px-4 py-2.5">Endpoint</th>
                <th className="eyebrow px-4 py-2.5">Cost</th>
                <th className="eyebrow px-4 py-2.5">Rows</th>
              </tr>
            </thead>
            <tbody>
              {byEndpoint.map((e) => (
                <tr key={e.endpoint} data-testid={`usage-endpoint-${e.endpoint}`} className="border-b border-neutral-800/50 transition-colors last:border-0 hover:bg-neutral-800/20">
                  <td className="px-4 py-2.5 font-medium text-neutral-200">{shortEndpoint(e.endpoint)}</td>
                  <td className="px-4 py-2.5"><span className="tnum text-neutral-200">{usd(e.cost)}</span></td>
                  <td className="px-4 py-2.5"><span className="tnum text-neutral-400">{Intl.NumberFormat("en", { notation: "compact" }).format(e.rows)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
