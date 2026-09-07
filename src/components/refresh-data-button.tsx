"use client";

import { useJob } from "@/components/use-job";
import { JobProgress } from "@/components/job-progress";

/**
 * The full-pipeline "Refresh data" trigger. Enqueues ONE async `refresh_all` job
 * that runs rankings → gaps → opportunities in dependency order server-side (each
 * later step reads what the earlier ones produce), then polls it to completion.
 *
 * Previously this fired three long synchronous POSTs in sequence — which always
 * failed on real data because the auth proxy times out ~30s while the work runs
 * for minutes. Now the POST returns instantly and only the poll waits. A failed
 * job surfaces the real error; success refreshes the server-rendered page.
 */
export function RefreshDataButton({ projectId }: { projectId: string }) {
  const job = useJob();

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void job.run(`/api/projects/${projectId}/refresh-all`)}
        disabled={job.demo || job.state === "running"}
        title={job.demo ? "Read-only demo" : undefined}
        aria-live="polite"
        className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-neutral-900 transition-opacity disabled:cursor-default disabled:opacity-50"
      >
        {job.state === "running" ? "Refreshing… (~1–2 min)" : "Refresh data"}
      </button>
      <JobProgress state={job.state} progress={job.progress} error={job.error} />
    </div>
  );
}
