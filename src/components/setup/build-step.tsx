"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { BuildJobs, Onboarding } from "@/lib/setup/onboarding";

type JobKey = keyof BuildJobs;
// `id: null` is a job the user asked for whose enqueue never returned an id. It
// renders as failed so Retry picks it up and the build cannot settle "done" on
// a job that was never run.
type JobView = { key: JobKey; label: string; id: string | null; status: "pending" | "running" | "done" | "failed"; progress: string | null; error: string | null };

const POLL_MS = 2000;
const ROUTES: Record<JobKey, string> = { refreshAll: "refresh-all", audit: "audit", backlinks: "backlinks", organic: "organic-keywords" };
const LABELS: Record<JobKey, string> = { refreshAll: "Rankings, gaps and opportunities", audit: "Site audit", backlinks: "Backlinks", organic: "Organic keywords" };
const ORDER: JobKey[] = ["refreshAll", "audit", "backlinks", "organic"];
const primary = "rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-[#2a3138] disabled:opacity-50";

function message(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

async function enqueue(projectId: string, key: JobKey): Promise<string> {
  const res = await fetch(`/api/projects/${projectId}/${ROUTES[key]}`, { method: "POST" });
  if (!res.ok) throw new Error(`Could not start ${LABELS[key].toLowerCase()}.`);
  const { jobId } = (await res.json()) as { jobId?: string };
  if (!jobId) throw new Error("The server did not return a job id.");
  return jobId;
}

async function patchOnboarding(projectId: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}/onboarding`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  // A refused record must never read as success: an unrecorded id is a job that
  // bills and that nothing will ever poll or retry.
  if (!res.ok) throw new Error("Could not save the build state.");
}

function queued(key: JobKey, id: string): JobView {
  return { key, label: LABELS[key], id, status: "pending", progress: null, error: null };
}

function viewsFrom(ids: BuildJobs): JobView[] {
  return ORDER.filter((k) => ids[k]).map((k) => queued(k, ids[k]!));
}

/**
 * Rows in ORDER for every id we hold plus every key we just asked for: a key we
 * enqueued this round starts over, one we already had keeps the status we last
 * polled, and one that never got an id is failed so Retry picks it up.
 */
function mergeViews(asked: JobKey[], ids: BuildJobs, fresh: JobKey[], prev: JobView[]): JobView[] {
  return ORDER.filter((k) => ids[k] !== undefined || asked.includes(k)).map((k) => {
    const id = ids[k];
    if (!id) return { key: k, label: LABELS[k], id: null, status: "failed", progress: null, error: "Not started." };
    if (fresh.includes(k)) return queued(k, id);
    return prev.find((j) => j.key === k) ?? queued(k, id);
  });
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
  // A reload arrives with recorded ids and no idea what became of them, so the
  // first poll runs immediately instead of after POLL_MS. Cleared only once a
  // result has been applied, so React's double-invoked mount effect in
  // development (whose first pass is cancelled) still reconciles.
  const unreconciled = useRef(onboarding.build === "running" || onboarding.build === "failed");

  async function start(keys: JobKey[], previous: BuildJobs) {
    if (keys.length === 0) {
      setError("Nothing to run — reload the page to see where the jobs stand.");
      return;
    }
    setError(null);
    setStarting(true);
    const ids: BuildJobs = { ...previous };
    const fresh: JobKey[] = [];
    try {
      for (const k of keys) {
        const id = await enqueue(projectId, k);
        ids[k] = id;
        fresh.push(k);
        // Record each id the moment it exists. Recording once at the end leaves
        // a running, billing job unrecorded whenever a later call fails, and the
        // only affordance left would enqueue (and bill) it a second time.
        await patchOnboarding(projectId, { build: "running", buildJobs: { [k]: id } });
      }
    } catch (e) {
      setError(message(e, "Could not start the build."));
    } finally {
      setJobs((prev) => mergeViews(keys, ids, fresh, prev));
      // Whatever went wrong, ids we did record are running and must be polled.
      if (fresh.length > 0) setPhase("running");
      setStarting(false);
    }
  }

  useEffect(() => {
    // Mounting on a build that was already under way runs one reconciliation
    // pass before any button is usable: without it a "failed" build shows no
    // failed rows, so Retry would enqueue nothing, mark every job done and
    // advance the wizard on missing data.
    const reconcile = unreconciled.current;
    if (phase !== "running" && !reconcile) return;
    if (jobs.length === 0) return;
    let cancelled = false;
    // The array is threaded through the loop rather than read from the `jobs`
    // closure: re-mapping that snapshot every tick would re-fetch ids that
    // already reached a terminal state until the last sibling finished.
    async function poll(current: JobView[]) {
      const next = await Promise.all(current.map(async (j) => {
        if (!j.id || j.status === "done" || j.status === "failed") return j;
        try {
          const res = await fetch(`/api/jobs/${j.id}`);
          if (!res.ok) return j;
          const body = (await res.json()) as { status?: string; error?: string | null; progress?: string | null };
          const status = body.status === "done" || body.status === "failed" ? body.status : "running";
          return { ...j, status, progress: body.progress ?? null, error: status === "failed" ? body.error ?? "The job failed." : null } as JobView;
        } catch { return j; }
      }));
      if (cancelled) return;
      unreconciled.current = false;
      setJobs(next);
      if (next.some((j) => j.status === "running" || j.status === "pending")) { timer.current = setTimeout(() => void poll(next), POLL_MS); return; }
      const settled: Onboarding["build"] = next.some((j) => j.status === "failed") ? "failed" : "done";
      if (settled === phase) return;
      // A refused record leaves the server on "running": say so and don't
      // refresh, or the re-rendered step would reconcile, fail to record again
      // and refresh in a loop.
      let stored = true;
      try { await patchOnboarding(projectId, { build: settled }); }
      catch (e) { stored = false; if (!cancelled) setError(message(e, "Could not save the build state.")); }
      if (cancelled) return;
      setPhase(settled);
      if (settled === "done" && stored) router.refresh();
    }
    if (reconcile) void poll(jobs);
    else timer.current = setTimeout(() => void poll(jobs), POLL_MS);
    return () => { cancelled = true; if (timer.current) clearTimeout(timer.current); };
    // `jobs` is deliberately not a dependency: the loop threads its own array
    // forward, and restarting it on every poll result would reset the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, projectId]);

  const failedKeys = jobs.filter((j) => j.status === "failed").map((j) => j.key);
  // Only ids we actually hold: a key that never got one has to be enqueued again.
  const recorded: BuildJobs = {};
  for (const j of jobs) if (j.id) recorded[j.key] = j.id;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-base font-semibold text-neutral-900">Build the first picture</h1>
        <p className="mt-1 text-sm text-neutral-600">Rankings for every tracked keyword, competitor gaps, the first opportunity shortlist, and a site audit. Ten minutes at most; you can leave this page and come back.</p>
      </div>
      {phase === "pending" ? (
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" checked={extras} onChange={(e) => setExtras(e.target.checked)} />
          Also fetch backlinks and organic keywords (≈ ${extrasCost.toFixed(2)})
        </label>
      ) : null}
      {jobs.length > 0 ? (
        <ul className="panel divide-y divide-neutral-200 px-4">
          {jobs.map((j) => (
            <li key={j.key} data-testid={`build-job-${j.key}`} className="flex flex-col gap-1 py-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-neutral-900">{j.label}</span>
                <span className={`text-xs ${j.status === "done" ? "text-up" : j.status === "failed" ? "text-at-risk" : "text-neutral-600"}`}>{j.status === "running" ? "Running" : j.status === "done" ? "Done" : j.status === "failed" ? "Failed" : "Queued"}</span>
              </div>
              {j.status === "running" && j.progress ? <span role="status" className="text-xs text-neutral-600">{j.progress}</span> : null}
              {j.status === "failed" ? <span role="alert" className="text-xs text-at-risk">{j.error}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p role="alert" className="text-sm text-at-risk">{error}</p> : null}
      {phase === "pending" ? (
        <button type="button" disabled={starting} className={`${primary} self-start`} onClick={() => void start(extras ? ORDER : ["refreshAll", "audit"], {})}>Start build</button>
      ) : phase === "failed" && failedKeys.length > 0 ? (
        <button type="button" disabled={starting} className={`${primary} self-start`} onClick={() => void start(failedKeys, recorded)}>Retry failed</button>
      ) : phase === "done" ? (
        <p className="text-sm text-up">All done.</p>
      ) : null}
    </div>
  );
}
