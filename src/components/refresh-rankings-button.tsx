"use client";

import { useJob } from "@/components/use-job";
import { JobProgress } from "@/components/job-progress";

/**
 * The Rankings page's single-job refresh: enqueues `rank_refresh` (re-fetches
 * SERP position for every tracked keyword) and polls it to completion. Reach for
 * `RefreshDataButton` where the WHOLE chain (rankings + gaps + opportunities) is
 * wanted. Async job + poll — see use-job.ts for why this can't be a sync POST.
 */
export function RefreshRankingsButton({ projectId }: { projectId: string }) {
  const job = useJob();

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void job.run(`/api/projects/${projectId}/refresh`)}
        disabled={job.state === "running"}
        aria-live="polite"
        className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-neutral-900 transition-opacity disabled:cursor-default disabled:opacity-50"
      >
        {job.state === "running" ? "Refreshing rankings… · ~1–2 min" : "Refresh rankings"}
      </button>
      <JobProgress state={job.state} progress={job.progress} error={job.error} />
    </div>
  );
}
