"use client";

import { useJob } from "@/components/use-job";

/** Runs a Reddit radar scan as an async job and polls to completion. */
export function RunRedditRadarButton({ projectId, label = "Run scan" }: { projectId: string; label?: string }) {
  const job = useJob();
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void job.run(`/api/projects/${projectId}/reddit-radar/scan`)}
        disabled={job.state === "running"}
        aria-live="polite"
        className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-neutral-900 transition-opacity disabled:cursor-default disabled:opacity-50"
      >
        {job.state === "running" ? "Scanning…" : label}
      </button>
      <span role="status" aria-live="polite" className="text-xs text-at-risk">
        {job.error ?? null}
      </span>
    </div>
  );
}
