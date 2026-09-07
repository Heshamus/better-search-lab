"use client";

import { useJob } from "@/components/use-job";
import { JobProgress } from "@/components/job-progress";

/** Scans Reddit conversations as an async job and polls to completion. */
export function RunConversationsScanButton({
  projectId,
  label = "Scan Reddit",
}: {
  projectId: string;
  label?: string;
}) {
  const job = useJob();
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void job.run(`/api/projects/${projectId}/reddit-conversations/scan`)}
        disabled={job.state === "running"}
        aria-live="polite"
        className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-neutral-900 transition-opacity disabled:cursor-default disabled:opacity-50"
      >
        {job.state === "running" ? "Scanning…" : label}
      </button>
      <JobProgress state={job.state} progress={job.progress} error={job.error} />
    </div>
  );
}
