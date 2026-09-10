"use client";

import type { CompetitorKeywordRow, TopPage } from "@/lib/competitor-intel";
import { formatCompact } from "@/lib/format";
import { KdMeter, PositionBadge } from "@/components/viz";
import { useJob } from "@/components/use-job";
import { JobProgress } from "@/components/job-progress";

const emptyStateClass =
  "rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-6 text-center text-sm text-neutral-500";

const sectionHeadingClass = "text-sm font-semibold text-neutral-900";

const tableWrapperClass = "panel overflow-x-auto";

const tableClass = "w-full min-w-[560px] border-collapse text-left text-sm";

const theadRowClass = "border-b border-neutral-200";

const thClass = "eyebrow px-4 py-2.5";

const tdClass = "px-4 py-2.5 text-neutral-700";

const tdStrongClass = "px-4 py-2.5 font-medium text-neutral-900";

const trClass = "border-b border-neutral-200 transition-colors last:border-0 hover:bg-neutral-50";

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
  // Competitor intel calls DataForSEO ranked-keywords per competitor and can run
  // for a minute — enqueue the job and poll it, don't hold a sync POST open.
  const job = useJob();

  const isEmpty = keywords.length === 0 && topPages.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h2 className="text-base font-semibold text-neutral-900">{competitorDomain}</h2>
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={() => void job.run(`/api/projects/${projectId}/competitors/intel/refresh`)}
            disabled={job.demo || job.state === "running"}
            title={job.demo ? "Read-only demo" : undefined}
            aria-live="polite"
            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#2a3138] disabled:cursor-default disabled:opacity-50"
          >
            {job.state === "running" ? "Refreshing…" : "Refresh"}
          </button>
          <JobProgress state={job.state} progress={job.progress} error={job.error} />
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
                        <td className="px-4 py-2.5"><PositionBadge pos={row.rankAbsolute} /></td>
                        <td className="px-4 py-2.5"><span className="tnum text-neutral-800">{formatCompact(row.volume)}</span></td>
                        <td className="px-4 py-2.5"><KdMeter kd={row.difficulty} /></td>
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
                        <td className="px-4 py-2.5"><span className="tnum text-neutral-800">{formatCompact(page.keywordCount)}</span></td>
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
