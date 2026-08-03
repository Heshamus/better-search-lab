"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CompetitorKeywordRow, TopPage } from "@/lib/competitor-intel";

type RefreshState = "idle" | "busy" | "error";

// Honesty rule (mirrors gap-table.tsx/profile-review.tsx/rankings-table.tsx):
// a null metric renders "—", never a fabricated 0.
function fmt(n: number | null): string {
  return n == null ? "—" : `${n}`;
}

const emptyStateClass =
  "rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400";

const sectionHeadingClass = "text-sm font-semibold text-neutral-900 dark:text-white";

const tableWrapperClass =
  "overflow-x-auto rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900";

const tableClass = "w-full min-w-[560px] border-collapse text-left text-sm";

const theadRowClass = "border-b border-neutral-200 dark:border-neutral-800";

const thClass = "px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400";

const tdClass = "px-4 py-2 text-neutral-600 dark:text-neutral-300";

const tdStrongClass = "px-4 py-2 font-medium text-neutral-900 dark:text-white";

const trClass = "border-b border-neutral-100 last:border-0 dark:border-neutral-800/60";

/**
 * Task 12: the per-competitor "what they rank for" panel — top keywords and
 * top pages read back from `competitor_keywords` via listCompetitorKeywords /
 * listCompetitorTopPages (Task 10), plus the one-click trigger that
 * re-collects both from DataForSEO via the Task 11 route
 * (`POST /api/projects/[id]/competitors/intel/refresh`, which runs the
 * competitor_intel job with no body). Mirrors refresh-gaps-button.tsx's
 * fetch -> !res.ok/catch -> router.refresh() flow.
 *
 * `keywords` and `topPages` are plain reads supplied by the server-component
 * caller (matching the read/mutation split used throughout this app: server
 * components read, client components mutate-then-refresh) — this component
 * never fetches its own data on mount, only triggers the job that produces
 * it.
 *
 * The Refresh trigger always renders, including in the empty state — a
 * competitor with nothing fetched yet still needs a way to run the first
 * fetch, so the button is never gated behind already having data.
 */
export function CompetitorIntelPanel({
  projectId,
  competitorDomain,
  keywords,
  topPages,
}: {
  projectId: string;
  competitorDomain: string;
  keywords: CompetitorKeywordRow[];
  topPages: TopPage[];
}) {
  const router = useRouter();
  const [state, setState] = useState<RefreshState>("idle");

  async function handleRefresh() {
    setState("busy");
    try {
      const res = await fetch(`/api/projects/${projectId}/competitors/intel/refresh`, { method: "POST" });
      if (!res.ok) {
        setState("error");
        return;
      }
      setState("idle");
      router.refresh();
    } catch {
      // Network error (fetch rejected) — same honest error as !res.ok.
      setState("error");
    }
  }

  const isEmpty = keywords.length === 0 && topPages.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h2 className="text-base font-semibold text-neutral-900 dark:text-white">{competitorDomain}</h2>
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={state === "busy"}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-neutral-900 transition-opacity disabled:cursor-default disabled:opacity-50"
          >
            {state === "busy" ? "Refreshing…" : "Refresh"}
          </button>
          {state === "error" ? (
            <span className="text-xs text-at-risk">Couldn&rsquo;t refresh — try again.</span>
          ) : null}
        </div>
      </div>

      {isEmpty ? (
        <p className={emptyStateClass}>Not fetched yet — click Refresh.</p>
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <h3 className={sectionHeadingClass}>Top keywords</h3>
            {keywords.length === 0 ? (
              <p className={emptyStateClass}>No keywords fetched yet.</p>
            ) : (
              <div className={tableWrapperClass}>
                <table className={tableClass}>
                  <thead>
                    <tr className={theadRowClass}>
                      <th className={thClass}>Keyword</th>
                      <th className={thClass}>Position</th>
                      <th className={thClass}>Volume</th>
                      <th className={thClass}>KD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keywords.map((row) => (
                      <tr key={row.id} data-testid={`intel-keyword-row-${row.id}`} className={trClass}>
                        <td className={tdStrongClass}>{row.keyword}</td>
                        <td className={tdClass}>{fmt(row.rankAbsolute)}</td>
                        <td className={tdClass}>{fmt(row.volume)}</td>
                        <td className={tdClass}>{fmt(row.difficulty)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h3 className={sectionHeadingClass}>Top pages</h3>
            {topPages.length === 0 ? (
              <p className={emptyStateClass}>No pages fetched yet.</p>
            ) : (
              <div className={tableWrapperClass}>
                <table className={tableClass}>
                  <thead>
                    <tr className={theadRowClass}>
                      <th className={thClass}>URL</th>
                      <th className={thClass}>Keywords</th>
                      <th className={thClass}>Top keywords</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topPages.map((page) => (
                      <tr key={page.url} data-testid={`intel-page-row-${page.url}`} className={trClass}>
                        <td className={tdStrongClass}>{page.url}</td>
                        <td className={tdClass}>{page.keywordCount}</td>
                        <td className={tdClass}>{page.topKeywords.join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
