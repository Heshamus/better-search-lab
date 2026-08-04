"use client";

import { useJob } from "@/components/use-job";

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
        disabled={job.state === "running"}
        aria-live="polite"
        className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-neutral-900 transition-opacity disabled:cursor-default disabled:opacity-50"
      >
        {job.state === "running" ? "Auditing… (~30–60s)" : label}
      </button>
      <span role="status" aria-live="polite" className="text-xs text-at-risk">
        {job.error ?? null}
      </span>
    </div>
  );
}
