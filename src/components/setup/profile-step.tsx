"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useJob } from "@/components/use-job";
import { JobProgress } from "@/components/job-progress";
import { ProfileReview } from "@/components/profile-review";
import type { ProfileCandidateRow } from "@/lib/profile";

const primary = "rounded-lg bg-accent px-3 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50";
const secondary = "rounded-lg border border-neutral-700 px-3 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-800/60 disabled:opacity-50";

async function patchOnboarding(projectId: string, body: Record<string, unknown>): Promise<string | null> {
  const res = await fetch(`/api/projects/${projectId}/onboarding`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (res.ok) return null;
  try { return ((await res.json()) as { error?: string }).error ?? "Could not save the step."; } catch { return "Could not save the step."; }
}

/**
 * Step 5 (spec §11.1): run the existing profile job with live progress, review
 * the candidates with the existing ProfileReview, continue once keywords are tracked.
 */
export function ProfileStep({ project, candidates, trackedCount }: {
  project: { id: string; name: string; domain: string; defaultLocationCode: number; defaultLanguageCode: string };
  candidates: ProfileCandidateRow[];
  trackedCount: number;
}) {
  const router = useRouter();
  const job = useJob();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function done() {
    setBusy(true); setError(null);
    try {
      const err = await patchOnboarding(project.id, { profile: "done" });
      if (err) { setError(err); return; }
      router.refresh();
    } catch { setError("Network error — please try again."); } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-base font-semibold text-white">Profile {project.name}</h1>
        <p className="mt-1 text-sm text-neutral-400">We crawl {project.domain}, read what it already ranks for, and expand into related keywords. Pick the ones worth tracking; the first build covers only those.</p>
      </div>
      {candidates.length === 0 ? (
        <div className="flex flex-col gap-2">
          <button type="button" className={`${primary} self-start`} disabled={job.state === "running"} onClick={() => void job.run(`/api/projects/${project.id}/profile`)}>
            {job.state === "running" ? "Profiling…" : "Profile this site"}
          </button>
          <JobProgress state={job.state} progress={job.progress} error={job.error} />
          <p className="text-xs text-neutral-500">Two DataForSEO Labs calls (≈ $0.02).</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <ProfileReview projectId={project.id} candidates={candidates} locationCode={project.defaultLocationCode} languageCode={project.defaultLanguageCode} />
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={primary} disabled={busy || trackedCount === 0} onClick={() => void done()} title={trackedCount === 0 ? "Track at least one keyword first" : undefined}>
              Continue
            </button>
            <span className="tnum text-xs text-neutral-500">{trackedCount} keyword{trackedCount === 1 ? "" : "s"} tracked</span>
            <button type="button" className={secondary} disabled={job.state === "running"} onClick={() => void job.run(`/api/projects/${project.id}/profile`)}>
              {job.state === "running" ? "Profiling…" : "Profile again"}
            </button>
            <JobProgress state={job.state} progress={job.progress} error={job.error} />
          </div>
        </div>
      )}
      {error ? <p role="alert" className="text-sm text-at-risk">{error}</p> : null}
    </div>
  );
}
