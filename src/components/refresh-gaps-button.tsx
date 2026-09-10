"use client";

import { useJob } from "@/components/use-job";
import { JobProgress } from "@/components/job-progress";

/**
 * The Competitors view's "Find keyword gaps" control: enqueues the `gap_refresh`
 * job (re-collects keyword-gap rows from DataForSEO for every tracked competitor)
 * and polls it to completion, then the server-rendered GapTable re-reads the
 * fresh rows. Async job + poll — see use-job.ts. A failure surfaces the real error.
 */
export function RefreshGapsButton({ projectId }: { projectId: string }) {
  const job = useJob();

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void job.run(`/api/projects/${projectId}/gaps/refresh`)}
        disabled={job.demo || job.state === "running"}
        title={job.demo ? "Read-only demo" : undefined}
        aria-live="polite"
        className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#2a3138] disabled:cursor-default disabled:opacity-50"
      >
        {job.state === "running" ? "Finding gaps…" : "Find keyword gaps"}
      </button>
      <JobProgress state={job.state} progress={job.progress} error={job.error} />
    </div>
  );
}
