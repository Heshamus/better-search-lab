"use client";

import { useJob } from "@/components/use-job";
import { JobProgress } from "@/components/job-progress";

/**
 * Runs a site audit as an async job (crawl + score) and polls it to completion,
 * then refreshes the server-rendered report. Free (own crawler); a failure shows
 * the real error.
 */
export function RunAuditButton({ projectId, label = "Run audit" }: { projectId: string; label?: string }) {
  const job = useJob();
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void job.run(`/api/projects/${projectId}/audit`)}
        disabled={job.demo || job.state === "running"}
        title={job.demo ? "Read-only demo" : undefined}
        aria-live="polite"
        className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#2a3138] disabled:cursor-default disabled:opacity-50"
      >
        {job.state === "running" ? "Auditing… (~30–60s)" : label}
      </button>
      <JobProgress state={job.state} progress={job.progress} error={job.error} />
    </div>
  );
}
