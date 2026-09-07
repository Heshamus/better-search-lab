"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { BuildJobs, Onboarding } from "@/lib/setup/onboarding";

type JobKey = keyof BuildJobs;
type JobView = { key: JobKey; label: string; id: string; status: "pending" | "running" | "done" | "failed"; progress: string | null; error: string | null };

const POLL_MS = 2000;
const ROUTES: Record<JobKey, string> = { refreshAll: "refresh-all", audit: "audit", backlinks: "backlinks", organic: "organic-keywords" };
const LABELS: Record<JobKey, string> = { refreshAll: "Rankings, gaps and opportunities", audit: "Site audit", backlinks: "Backlinks", organic: "Organic keywords" };
const ORDER: JobKey[] = ["refreshAll", "audit", "backlinks", "organic"];
const primary = "rounded-lg bg-accent px-3 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50";

async function enqueue(projectId: string, key: JobKey): Promise<string> {
  const res = await fetch(`/api/projects/${projectId}/${ROUTES[key]}`, { method: "POST" });
  if (!res.ok) throw new Error(`Could not start ${LABELS[key].toLowerCase()}.`);
  const { jobId } = (await res.json()) as { jobId?: string };
  if (!jobId) throw new Error("The server did not return a job id.");
  return jobId;
}

async function patchOnboarding(projectId: string, body: Record<string, unknown>): Promise<void> {
  await fetch(`/api/projects/${projectId}/onboarding`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

/**
 * Step 7 (spec §11.1): enqueue the build jobs, RECORD their ids, poll the
 * recorded ids. Reloading the page resumes polling instead of enqueuing again;
 * Retry re-enqueues only the jobs that failed.
 */
export function BuildStep({ projectId, onboarding, extrasCost }: { projectId: string; onboarding: Onboarding; extrasCost: number }) {
  const router = useRouter();
  const [extras, setExtras] = useState(false);
  const [phase, setPhase] = useState<Onboarding["build"]>(onboarding.build);
  const [jobs, setJobs] = useState<JobView[]>(() => viewsFrom(onboarding.buildJobs));
  const [error, setError] = useState<string | null>(null);
  // Guards Start/Retry against a double-click: `phase` only flips to "running"
  // after the enqueue + PATCH round trip resolves, so without this a second
  // click during that window would enqueue (and bill) every job twice.
  const [starting, setStarting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function viewsFrom(ids: BuildJobs): JobView[] {
    return ORDER.filter((k) => ids[k]).map((k) => ({ key: k, label: LABELS[k], id: ids[k]!, status: "running", progress: null, error: null }));
  }

  async function start(keys: JobKey[], previous: BuildJobs) {
    setError(null);
    setStarting(true);
    try {
      const ids: BuildJobs = {};
      for (const k of keys) ids[k] = await enqueue(projectId, k);
      const merged: BuildJobs = { ...previous, ...ids };
      await patchOnboarding(projectId, { build: "running", buildJobs: ids });
      setJobs(viewsFrom(merged).map((v) => (ids[v.key] ? v : { ...v, status: "done" })));
      setPhase("running");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the build.");
    } finally {
      setStarting(false);
    }
  }

  useEffect(() => {
    if (phase !== "running") return;
    let cancelled = false;
    async function poll() {
      const next = await Promise.all(jobs.map(async (j) => {
        if (j.status === "done" || j.status === "failed") return j;
        try {
          const res = await fetch(`/api/jobs/${j.id}`);
          if (!res.ok) return j;
          const body = (await res.json()) as { status?: string; error?: string | null; progress?: string | null };
          const status = body.status === "done" || body.status === "failed" ? body.status : "running";
          return { ...j, status, progress: body.progress ?? null, error: status === "failed" ? body.error ?? "The job failed." : null } as JobView;
        } catch { return j; }
      }));
      if (cancelled) return;
      setJobs(next);
      const running = next.some((j) => j.status === "running" || j.status === "pending");
      if (running) { timer.current = setTimeout(() => void poll(), POLL_MS); return; }
      const failed = next.some((j) => j.status === "failed");
      await patchOnboarding(projectId, { build: failed ? "failed" : "done" });
      if (cancelled) return;
      setPhase(failed ? "failed" : "done");
      if (!failed) router.refresh();
    }
    timer.current = setTimeout(() => void poll(), POLL_MS);
    return () => { cancelled = true; if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, projectId]);

  const failedKeys = jobs.filter((j) => j.status === "failed").map((j) => j.key);
  const recorded: BuildJobs = Object.fromEntries(jobs.map((j) => [j.key, j.id]));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-base font-semibold text-white">Build the first picture</h1>
        <p className="mt-1 text-sm text-neutral-400">Rankings for every tracked keyword, competitor gaps, the first opportunity shortlist, and a site audit. Ten minutes at most; you can leave this page and come back.</p>
      </div>
      {phase === "pending" ? (
        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input type="checkbox" checked={extras} onChange={(e) => setExtras(e.target.checked)} />
          Also fetch backlinks and organic keywords (≈ ${extrasCost.toFixed(2)})
        </label>
      ) : null}
      {jobs.length > 0 ? (
        <ul className="panel divide-y divide-neutral-800/60 px-4">
          {jobs.map((j) => (
            <li key={j.key} data-testid={`build-job-${j.key}`} className="flex flex-col gap-1 py-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-neutral-100">{j.label}</span>
                <span className={`text-xs ${j.status === "done" ? "text-up" : j.status === "failed" ? "text-at-risk" : "text-neutral-400"}`}>{j.status === "running" ? "Running" : j.status === "done" ? "Done" : j.status === "failed" ? "Failed" : "Queued"}</span>
              </div>
              {j.status === "running" && j.progress ? <span role="status" className="text-xs text-neutral-400">{j.progress}</span> : null}
              {j.status === "failed" ? <span role="alert" className="text-xs text-at-risk">{j.error}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p role="alert" className="text-sm text-at-risk">{error}</p> : null}
      {phase === "pending" ? (
        <button type="button" disabled={starting} className={`${primary} self-start`} onClick={() => void start(extras ? ORDER : ["refreshAll", "audit"], {})}>Start build</button>
      ) : phase === "failed" ? (
        <button type="button" disabled={starting} className={`${primary} self-start`} onClick={() => void start(failedKeys, recorded)}>Retry failed</button>
      ) : phase === "done" ? (
        <p className="text-sm text-up">All done.</p>
      ) : null}
    </div>
  );
}
