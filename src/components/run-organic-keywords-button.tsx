"use client";
import { useJob } from "@/components/use-job";
import { JobProgress } from "@/components/job-progress";

export function RunOrganicKeywordsButton({ projectId }: { projectId: string }) {
  const job = useJob();
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void job.run(`/api/projects/${projectId}/organic-keywords`)}
        disabled={job.demo || job.state === "running"}
        title={job.demo ? "Read-only demo" : undefined}
        aria-live="polite"
        className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-neutral-900 transition-opacity disabled:cursor-default disabled:opacity-50"
      >
        {job.state === "running" ? "Fetching… (~a few sec)" : "Refresh organic keywords"}
      </button>
      <JobProgress state={job.state} progress={job.progress} error={job.error} />
    </div>
  );
}
