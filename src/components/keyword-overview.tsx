"use client";

import { useMemo, useState } from "react";
import { MARKETS, DEFAULT_MARKET, type Market } from "@/lib/markets";
import { parseKeywordList } from "@/lib/keyword-list";
import { buildKeywordCsv } from "@/lib/keyword-csv";
import { formatCompact } from "@/lib/format";
import { KdMeter, Delta, Sparkline } from "@/components/viz";
import type { KeywordOverviewRow } from "@/lib/dataforseo/labs";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "results"; rows: KeywordOverviewRow[]; dropped: number; market: Market };

type SortKey = "trendPct" | "searchVolume" | "difficulty" | "cpc" | "competition";

const fmtCpc = (n: number | null) => (n == null ? "—" : `$${n.toFixed(2)}`);

// Descending, nulls last — shared by the default sort and the header clicks.
function sortRows(rows: KeywordOverviewRow[], key: SortKey): KeywordOverviewRow[] {
  return [...rows].sort((a, b) => {
    const av = a[key], bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return bv - av;
  });
}

export function KeywordOverview() {
  const [raw, setRaw] = useState("");
  const [marketLabel, setMarketLabel] = useState(DEFAULT_MARKET.label);
  const [state, setState] = useState<State>({ status: "idle" });
  const [sortKey, setSortKey] = useState<SortKey>("trendPct");

  const parsed = useMemo(() => parseKeywordList(raw), [raw]);
  const market = MARKETS.find((m) => m.label === marketLabel) ?? DEFAULT_MARKET;
  const rows = state.status === "results" ? state.rows : [];
  const sorted = useMemo(() => sortRows(rows, sortKey), [rows, sortKey]);

  async function lookUp() {
    if (parsed.keywords.length === 0 || state.status === "loading") return;
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/keyword-overview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keywords: parsed.keywords, locationCode: market.locationCode, languageCode: market.languageCode }),
      });
      if (!res.ok) { setState({ status: "error" }); return; }
      const data = await res.json();
      // Snapshot the market actually used for THIS fetch — `market` here is the
      // same value the request body above just sent. If the user later flips the
      // dropdown without re-running Look up, the live `market` derived from
      // `marketLabel` would drift from the data on screen; the results label and
      // CSV filename must keep claiming the market that was actually fetched.
      //
      // `dropped` likewise comes from the CLIENT's `parsed.dropped` (the count
      // computed from the textarea at lookup time), not `data.dropped` — the
      // client already pre-caps to 100 before POSTing, so the server's own
      // `dropped` is always 0 and would make the post-lookup notice permanently
      // dead. Snapshotting the client value keeps it honest if the cap logic
      // ever changes (e.g. someone pastes >100 keywords).
      setState({ status: "results", rows: (data.rows ?? []) as KeywordOverviewRow[], dropped: parsed.dropped, market });
    } catch { setState({ status: "error" }); }
  }

  function download() {
    // Narrow on `state` (not the live `market`) so the filename always names the
    // market that was actually fetched, even if the dropdown moved on since.
    if (state.status !== "results" || state.rows.length === 0) return;
    const csv = buildKeywordCsv(sorted);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `keyword-overview-${state.market.label.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  const HEADERS: [SortKey, string][] = [
    ["searchVolume", "Volume"], ["trendPct", "Δ 12-mo %"], ["difficulty", "KD"], ["cpc", "CPC"], ["competition", "Comp"],
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-col gap-1">
          <label htmlFor="ko-input" className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Keywords <span className="normal-case text-neutral-400">— one per line or comma-separated</span>
          </label>
          <textarea
            id="ko-input" rows={6} value={raw} onChange={(e) => setRaw(e.target.value)}
            placeholder={"project management software\nnotion alternative\nbest crm"}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-accent dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
          />
          <div className="flex items-center justify-between text-xs text-neutral-500">
            <span className={parsed.keywords.length >= 100 ? "text-at-risk" : ""}>{parsed.keywords.length} / 100</span>
            {parsed.dropped > 0 ? <span className="text-at-risk">{parsed.dropped} over the cap will be dropped</span> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="ko-market" className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Market</label>
            <select
              id="ko-market" value={marketLabel} onChange={(e) => setMarketLabel(e.target.value)}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
            >
              {MARKETS.map((m) => <option key={m.locationCode} value={m.label}>{m.label}</option>)}
            </select>
          </div>
          <button
            type="button" onClick={lookUp} disabled={parsed.keywords.length === 0 || state.status === "loading"}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-neutral-900 transition-opacity disabled:cursor-default disabled:opacity-50"
          >
            {state.status === "loading" ? "Looking up…" : "Look up"}
          </button>
        </div>
      </div>

      {state.status === "idle" ? (
        <p className="rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
          Paste up to 100 keywords, choose a market, and look up volume, difficulty and 12-month trend. Nothing is saved.
        </p>
      ) : null}

      {state.status === "error" ? (
        <p className="rounded-xl border border-at-risk/40 bg-at-risk/10 px-4 py-3 text-sm text-at-risk">
          Couldn&rsquo;t look up those keywords — try again.
        </p>
      ) : null}

      {state.status === "results" ? (
        <>
          {state.dropped > 0 ? (
            <p className="text-xs text-at-risk">{state.dropped} keyword{state.dropped === 1 ? "" : "s"} dropped over the 100 cap.</p>
          ) : null}
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-500">{rows.length} keyword{rows.length === 1 ? "" : "s"} · {state.market.label}</span>
            <button type="button" onClick={download} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-accent dark:border-neutral-700 dark:text-neutral-200">
              Download CSV
            </button>
          </div>
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-800">
                  <th className="eyebrow px-4 py-2.5">Keyword</th>
                  <th className="eyebrow px-4 py-2.5">12-mo</th>
                  {HEADERS.map(([key, label]) => (
                    <th key={key} className="eyebrow cursor-pointer select-none px-4 py-2.5" onClick={() => setSortKey(key)}>
                      {label}{sortKey === key ? " ↓" : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.keyword} data-testid={`ko-row-${r.keyword}`} className="border-b border-neutral-800/50 last:border-0 hover:bg-neutral-800/20">
                    <td className="px-4 py-2.5 font-medium text-white">{r.keyword}</td>
                    <td className="px-4 py-2.5"><Sparkline values={r.monthly.map((m) => m.volume ?? 0)} /></td>
                    <td className="px-4 py-2.5"><span className="tnum text-neutral-200">{formatCompact(r.searchVolume)}</span></td>
                    <td className="px-4 py-2.5"><Delta value={r.trendPct} />{r.trendPct != null && r.trendPct !== 0 ? <span className="text-xs text-neutral-500">%</span> : null}</td>
                    <td className="px-4 py-2.5"><KdMeter kd={r.difficulty} /></td>
                    <td className="px-4 py-2.5"><span className="tnum text-neutral-300">{fmtCpc(r.cpc)}</span></td>
                    <td className="px-4 py-2.5"><span className="tnum text-neutral-400">{r.competition == null ? "—" : r.competition.toFixed(2)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
