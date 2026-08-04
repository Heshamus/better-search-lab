"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { RankingRow } from "@/lib/rankings";
import { RankSparkline, type RankSparklinePoint } from "@/components/rank-sparkline";
import { formatMetric } from "@/lib/format";

type SortKey = "rankAbsolute" | "delta7" | "volume" | "difficulty";
type SortState = { key: SortKey | null; dir: 1 | -1 };

// Nulls always sort to the bottom, in EITHER direction — a keyword with no
// rank/metric yet is "unknown", not "worst", so it must not jump to the top
// just because the user picked descending.
function compareNullsLast(a: number | null, b: number | null, dir: 1 | -1): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return dir * (a - b);
}

// Honesty rule (brief): deltaForKeyword is previous-minus-current, so a
// POSITIVE delta means the rank NUMBER fell = the keyword climbed = improved
// (accent, ▲); a NEGATIVE delta means it fell in the rankings (at-risk, ▼); a
// genuine, exact 0 is neither and gets a neutral, arrow-less render so it's
// never confused with the null "no recent data" case right above it.
function DeltaCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-neutral-400 dark:text-neutral-500">—</span>;
  if (value > 0) return <span className="text-accent">{`▲${value}`}</span>;
  if (value < 0) return <span className="text-at-risk">{`▼${Math.abs(value)}`}</span>;
  return <span className="text-neutral-500 dark:text-neutral-400">0</span>;
}

// Position rendering rule (brief): "failed" shows an honest amber "not
// fetched" instead of any stale/fabricated rank; "unknown" (a tracked
// keyword that's never been fetched at all) shows a distinct muted "not yet
// checked" — never conflated with "failed", and never a bare "—" either,
// since that would blur "no data" with "a real null metric".
function PositionCell({ row }: { row: RankingRow }) {
  if (row.fetchStatus === "failed") return <span className="text-at-risk">not fetched</span>;
  if (row.fetchStatus === "unknown") {
    return <span className="text-neutral-400 dark:text-neutral-500">not yet checked</span>;
  }
  return <span>{formatMetric(row.rankAbsolute)}</span>;
}

function SortableHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: 1 | -1;
  onClick: () => void;
}) {
  return (
    <th className="px-4 py-2">
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
      >
        {label}
        {active ? <span aria-hidden>{dir === 1 ? "▲" : "▼"}</span> : null}
      </button>
    </th>
  );
}

function PlainHeader({ label }: { label: string }) {
  return (
    <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
      {label}
    </th>
  );
}

/**
 * Per-row history drill-in (Task 5): fetches the guarded history route only
 * once its row is expanded — never eagerly for every row up front — and
 * renders the sparkline. `res.ok` is checked explicitly so a failed fetch
 * surfaces as a small inline error rather than silently rendering an empty
 * or fabricated chart (guardrail).
 */
function HistoryDrilldown({ keywordId }: { keywordId: string }) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error" }
    | { status: "ok"; points: RankSparklinePoint[] }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/keywords/${keywordId}/history`)
      .then((res) => {
        if (!res.ok) throw new Error(`history fetch failed: ${res.status}`);
        return res.json();
      })
      .then((points: RankSparklinePoint[]) => {
        if (!cancelled) setState({ status: "ok", points });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [keywordId]);

  if (state.status === "loading") {
    return <p className="px-2 py-3 text-xs text-neutral-400 dark:text-neutral-500">Loading history…</p>;
  }
  if (state.status === "error") {
    return <p className="px-2 py-3 text-xs text-at-risk">Couldn&rsquo;t load rank history — try again later.</p>;
  }
  return (
    <div className="px-2 py-3">
      <RankSparkline points={state.points} />
    </div>
  );
}

/**
 * The Rankings view's sortable keyword table (Task 5). Client component:
 * sort state and row-expansion are local UI state, and the per-row history
 * drill-in self-fetches on demand — none of that is server-fetchable. `rows`
 * itself is a plain read, supplied by the server-component page via
 * `listRankings`; this component never re-fetches the list itself.
 */
export function RankingsTable({ rows }: { rows: RankingRow[] }) {
  const [sort, setSort] = useState<SortState>({ key: null, dir: 1 });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function handleSort(key: SortKey) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  }

  function toggleExpand(keywordId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(keywordId)) next.delete(keywordId);
      else next.add(keywordId);
      return next;
    });
  }

  const sortedRows = useMemo(() => {
    if (!sort.key) return rows;
    const key = sort.key;
    return [...rows].sort((a, b) => compareNullsLast(a[key], b[key], sort.dir));
  }, [rows, sort]);

  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-200 dark:border-neutral-800">
            <PlainHeader label="Keyword" />
            <SortableHeader
              label="Position"
              active={sort.key === "rankAbsolute"}
              dir={sort.dir}
              onClick={() => handleSort("rankAbsolute")}
            />
            <SortableHeader
              label="Δ7"
              active={sort.key === "delta7"}
              dir={sort.dir}
              onClick={() => handleSort("delta7")}
            />
            <PlainHeader label="Δ30" />
            <SortableHeader
              label="Vol"
              active={sort.key === "volume"}
              dir={sort.dir}
              onClick={() => handleSort("volume")}
            />
            <SortableHeader
              label="KD"
              active={sort.key === "difficulty"}
              dir={sort.dir}
              onClick={() => handleSort("difficulty")}
            />
            <PlainHeader label="SERP features" />
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => {
            const isExpanded = expanded.has(row.keywordId);
            return (
              <Fragment key={row.keywordId}>
                <tr
                  data-testid={`ranking-row-${row.keywordId}`}
                  data-keyword-id={row.keywordId}
                  className="border-b border-neutral-100 last:border-0 dark:border-neutral-800/60"
                >
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => toggleExpand(row.keywordId)}
                      aria-expanded={isExpanded}
                      className="flex items-center gap-1.5 font-medium text-neutral-900 hover:underline dark:text-white"
                    >
                      <span aria-hidden className="text-neutral-400 dark:text-neutral-500">
                        {isExpanded ? "▾" : "▸"}
                      </span>
                      {row.keyword}
                    </button>
                  </td>
                  <td className="px-4 py-2" data-testid={`position-${row.keywordId}`}>
                    <PositionCell row={row} />
                  </td>
                  <td className="px-4 py-2" data-testid={`delta7-${row.keywordId}`}>
                    <DeltaCell value={row.delta7} />
                  </td>
                  <td className="px-4 py-2" data-testid={`delta30-${row.keywordId}`}>
                    <DeltaCell value={row.delta30} />
                  </td>
                  <td className="px-4 py-2 text-neutral-600 dark:text-neutral-300">{formatMetric(row.volume)}</td>
                  <td className="px-4 py-2 text-neutral-600 dark:text-neutral-300">{formatMetric(row.difficulty)}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {row.serpFeatures.map((feature) => (
                        <span
                          key={feature}
                          className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                        >
                          {feature}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
                {isExpanded ? (
                  <tr className="border-b border-neutral-100 bg-neutral-50 dark:border-neutral-800/60 dark:bg-neutral-950/40">
                    <td colSpan={7}>
                      <HistoryDrilldown keywordId={row.keywordId} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
