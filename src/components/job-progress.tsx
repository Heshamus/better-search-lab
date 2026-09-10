"use client";

import type { JobState } from "@/components/use-job";

/**
 * The one progress line under every long-running action (spec §11.2). It shows
 * exactly what the handler reported — never an invented percentage.
 */
export function JobProgress({ state, progress, error }: { state: JobState; progress: string | null; error: string | null }) {
  if (state === "running") {
    return (
      <span role="status" aria-live="polite" className="inline-flex items-center gap-1.5 text-xs text-neutral-600">
        <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-[--color-accent]" />
        {progress ?? "Working…"}
      </span>
    );
  }
  if (state === "error" && error) {
    return <span role="alert" className="text-xs text-at-risk">{error}</span>;
  }
  return null;
}
