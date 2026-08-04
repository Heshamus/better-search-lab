"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { GapRow } from "@/lib/competitors";
import { formatMetric } from "@/lib/format";

// Sort rule (brief §Task 8): opportunity-first — bigger search volume, then
// more competitors already ranking for it, is the strongest signal a gap is
// worth chasing. A null volume (metrics not yet fetched for that keyword)
// sorts LAST regardless of direction — mirrors rankings-table.tsx's
// compareNullsLast — so a gap with no known metrics never reads as the best
// (or worst) opportunity by accident.
function compareNullsLastDesc(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b - a;
}

function sortGapRows(rows: GapRow[]): GapRow[] {
  return [...rows].sort((a, b) => {
    const byVolume = compareNullsLastDesc(a.volume, b.volume);
    if (byVolume !== 0) return byVolume;
    return compareNullsLastDesc(a.competitorCount, b.competitorCount);
  });
}

type AddState = "idle" | "busy" | "done" | "error";

/**
 * Per-row "Add to tracking" control (Task 8). A GapSignal has no id (it's an
 * aggregate over competitor_gaps keyed by keyword), so the keyword string
 * itself is the only identity POSTed onward. Posts the guarded
 * `POST /api/keywords` route with the project's default location/language,
 * checks `res.ok` explicitly (a failed request surfaces as a small inline
 * error, never a silent no-op), and settles into a muted "Added" label once
 * confirmed — mirrors keyword-manager.tsx's TrackToggle and
 * opportunity-actions.tsx's Track button.
 */
function AddToTrackingButton({
  projectId,
  keyword,
  locationCode,
  languageCode,
}: {
  projectId: string;
  keyword: string;
  locationCode: number;
  languageCode: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<AddState>("idle");

  async function handleClick() {
    setState("busy");
    try {
      const res = await fetch("/api/keywords", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          keywords: [{ keyword, locationCode, languageCode }],
        }),
      });
      if (!res.ok) {
        setState("error");
        return;
      }
      setState("done");
      router.refresh();
    } catch {
      // Network error (fetch rejected) — same honest error as !res.ok.
      setState("error");
    }
  }

  if (state === "done") {
    return <span className="text-xs font-medium text-accent">Added</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={state === "busy"}
        className="rounded-lg border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-default disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
      >
        {state === "busy" ? "Adding…" : "Add to tracking"}
      </button>
      {state === "error" ? (
        <span className="text-xs text-at-risk">Couldn&rsquo;t add — try again.</span>
      ) : null}
    </div>
  );
}

/**
 * The Competitors view's keyword-gap table (Task 8, Task 14 adds the
 * "Competitors ranking" column): keywords at least one tracked competitor
 * ranks for that we don't, sorted by opportunity (volume desc, tie-broken by
 * how many competitors already rank for it). Each row shows WHICH tracked
 * competitors rank for that keyword (not just how many) and offers a
 * one-click "Add to tracking" so a gap can become a tracked keyword without
 * leaving the page.
 *
 * `rows` is a plain read supplied by the server-component Competitors page
 * via `listGapSignals` — this component never re-fetches the list itself,
 * matching the read/mutation split (server components read, client
 * components mutate-then-refresh). An empty list renders an honest inline
 * prompt rather than a bare table, never a fabricated row.
 */
export function GapTable({
  rows,
  projectId,
  defaultLocationCode,
  defaultLanguageCode,
}: {
  rows: GapRow[];
  projectId: string;
  defaultLocationCode: number;
  defaultLanguageCode: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
        No gaps yet — refresh to collect.
      </p>
    );
  }

  const sortedRows = sortGapRows(rows);

  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <table className="w-full min-w-[560px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-200 dark:border-neutral-800">
            <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Keyword
            </th>
            <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Competitors
            </th>
            <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Competitors ranking
            </th>
            <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Volume
            </th>
            <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              KD
            </th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => (
            <tr
              key={row.keyword}
              data-testid={`gap-row-${row.keyword}`}
              className="border-b border-neutral-100 last:border-0 dark:border-neutral-800/60"
            >
              <td className="px-4 py-2 font-medium text-neutral-900 dark:text-white">{row.keyword}</td>
              <td
                className="px-4 py-2 text-neutral-600 dark:text-neutral-300"
                data-testid={`gap-competitors-${row.keyword}`}
              >
                {row.competitorCount}
              </td>
              <td
                className="px-4 py-2 text-neutral-600 dark:text-neutral-300"
                data-testid={`gap-competitor-domains-${row.keyword}`}
              >
                {row.competitorDomains.join(", ")}
              </td>
              <td
                className="px-4 py-2 text-neutral-600 dark:text-neutral-300"
                data-testid={`gap-volume-${row.keyword}`}
              >
                {formatMetric(row.volume)}
              </td>
              <td className="px-4 py-2 text-neutral-600 dark:text-neutral-300">{formatMetric(row.difficulty)}</td>
              <td className="px-4 py-2">
                <AddToTrackingButton
                  projectId={projectId}
                  keyword={row.keyword}
                  locationCode={defaultLocationCode}
                  languageCode={defaultLanguageCode}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
