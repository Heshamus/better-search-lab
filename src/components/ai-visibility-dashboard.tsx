import type { AiVisibilityRow } from "@/lib/ai-visibility/store";
import { AreaTrend } from "@/components/charts";
import { formatCompact } from "@/lib/format";

const pct = (n: number, d: number): number => (d > 0 ? Math.round((100 * n) / d) : 0);
const ENGINE_LABEL: Record<string, string> = { perplexity: "Perplexity", chatgpt: "ChatGPT", gemini: "Gemini" };

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
 * AI-Visibility dashboard — whether AI engines (Perplexity/ChatGPT/Gemini)
 * name/cite this project's domain for its queries: headline rates + per-engine
 * split, the cited-rate trend, the per-query work-list (what you're invisible
 * on), and which competitor domains are winning the citations.
 */
export function AiVisibilityDashboard({ latest, history, projectDomain }: { latest: AiVisibilityRow; history: AiVisibilityRow[]; projectDomain: string }) {
  const citedRate = pct(latest.citedTotal, latest.answersTotal);
  const namedRate = pct(latest.namedTotal, latest.answersTotal);
  const queriesCited = latest.perQuery.filter((q) => q.cited).length;
  const trend = [...history].reverse(); // oldest → newest for the chart
  const trendPoints = trend.map((h) => pct(h.citedTotal, h.answersTotal));

  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Cited" value={`${citedRate}%`} hint={`${latest.citedTotal} of ${latest.answersTotal} answers`} />
        <Tile label="Named" value={`${namedRate}%`} hint="brand mentioned" />
        <Tile label="Queries covered" value={`${queriesCited}/${latest.perQuery.length}`} hint="cited on" />
        <Tile label="Answers" value={formatCompact(latest.answersTotal)} hint="measured this scan" />
      </dl>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="panel flex flex-col gap-4 p-5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">Cited rate over time</h3>
            <span className="eyebrow">higher is better</span>
          </div>
          <AreaTrend points={trendPoints} labels={trend.length ? [trend[0].scannedAt.toISOString().slice(0, 10), trend[trend.length - 1].scannedAt.toISOString().slice(0, 10)] : []} color="var(--color-accent)" height={190} yFormat={(n) => `${Math.round(n)}%`} emptyLabel="Scan again to build a trend" />
        </div>
        <div className="panel flex flex-col gap-3 p-5">
          <h3 className="text-sm font-semibold text-white">By engine</h3>
          <ul className="flex flex-col gap-2.5">
            {latest.engines.map((e) => (
              <li key={e.engine} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-xs text-neutral-300">{ENGINE_LABEL[e.engine] ?? e.engine}</span>
                <span className="relative h-4 flex-1 overflow-hidden rounded-md bg-neutral-800/60">
                  <span className="absolute inset-y-0 left-0 rounded-md bg-accent" style={{ width: `${Math.max(2, pct(e.cited, e.answers))}%` }} />
                </span>
                <span className="tnum w-16 shrink-0 text-right text-xs text-neutral-300">{e.cited}/{e.answers} cited</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="panel overflow-x-auto">
          <div className="border-b border-neutral-800 px-4 py-2.5"><h3 className="text-sm font-semibold text-white">Query work-list</h3></div>
          <table className="w-full min-w-[360px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-800">
                <th className="eyebrow px-4 py-2.5">Query</th>
                <th className="eyebrow px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {latest.perQuery.length ? latest.perQuery.map((q) => (
                <tr key={q.text} className="border-b border-neutral-800/50 last:border-0">
                  <td className="px-4 py-2.5 text-neutral-200" title={`${q.source} query`}>{q.text}</td>
                  <td className="px-4 py-2.5">
                    {q.cited ? (
                      <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[0.66rem] font-medium text-accent">Cited</span>
                    ) : q.named ? (
                      <span className="rounded bg-neutral-700/50 px-1.5 py-0.5 text-[0.66rem] font-medium text-neutral-300">Named</span>
                    ) : (
                      <span className="rounded bg-at-risk/10 px-1.5 py-0.5 text-[0.66rem] font-medium text-at-risk">Invisible</span>
                    )}
                  </td>
                </tr>
              )) : <tr><td colSpan={2} className="px-4 py-6 text-center text-sm text-neutral-500">No queries scanned yet.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="panel overflow-x-auto">
          <div className="border-b border-neutral-800 px-4 py-2.5"><h3 className="text-sm font-semibold text-white">Who&rsquo;s winning the citations</h3></div>
          <table className="w-full min-w-[300px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-800">
                <th className="eyebrow px-4 py-2.5">Domain</th>
                <th className="eyebrow px-4 py-2.5">Citations</th>
              </tr>
            </thead>
            <tbody>
              {latest.citedSources.length ? latest.citedSources.map((s) => (
                <tr key={s.domain} className={`border-b border-neutral-800/50 last:border-0 ${s.domain === projectDomain ? "bg-accent/5" : ""}`}>
                  <td className="px-4 py-2.5 font-medium text-white">{s.domain}{s.domain === projectDomain ? " (you)" : ""}</td>
                  <td className="px-4 py-2.5"><span className="tnum text-neutral-300">{s.count}</span></td>
                </tr>
              )) : <tr><td colSpan={2} className="px-4 py-6 text-center text-sm text-neutral-500">No sources cited yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
