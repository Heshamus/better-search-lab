"use client";

import { useJob } from "@/components/use-job";
import { JobProgress } from "@/components/job-progress";

/** Re-syncs Google Analytics data as an async job and polls to completion. */
export function RunGaSyncButton({ projectId, label = "Refresh" }: { projectId: string; label?: string }) {
  const job = useJob();
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void job.run(`/api/projects/${projectId}/ga/sync`)}
        disabled={job.demo || job.state === "running"}
        title={job.demo ? "Read-only demo" : undefined}
        aria-live="polite"
        className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#2a3138] disabled:cursor-default disabled:opacity-50"
      >
        {job.state === "running" ? "Syncing…" : label}
      </button>
      <JobProgress state={job.state} progress={job.progress} error={job.error} />
    </div>
  );
}
