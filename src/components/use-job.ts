"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

export type JobState = "idle" | "running" | "error";

const POLL_MS = 2000;
// Generous ceiling: the slowest job (profile_site) tops out ~3.5min. 12min means
// we only ever give up on a genuinely wedged job, never a slow-but-alive one.
const MAX_WAIT_MS = 12 * 60 * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const j = await res.json();
    return (j && typeof j.error === "string" && j.error) || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Enqueue an async job (POST enqueueUrl -> `{ jobId }`) and poll
 * `/api/jobs/[jobId]` until it finishes. This replaces the old pattern of firing
 * one long synchronous POST and treating any `!res.ok` as failure — that ALWAYS
 * failed for slow jobs because the auth proxy times out ~30s while the work runs
 * for minutes. Here the POST returns instantly; only the (fast) polls happen over
 * the job's lifetime.
 *
 * On success we `router.refresh()` (or call `onDone`) so the server-rendered page
 * pulls the fresh data. On failure we surface the job's REAL error string, so the
 * user sees what actually went wrong instead of a blanket "try again".
 */
export function useJob(): {
  state: JobState;
  error: string | null;
  run: (enqueueUrl: string, opts?: { onDone?: () => void | Promise<void> }) => Promise<void>;
} {
  const router = useRouter();
  const [state, setState] = useState<JobState>("idle");
  const [error, setError] = useState<string | null>(null);
  const activeRef = useRef(false);

  const run = useCallback(
    async (enqueueUrl: string, opts?: { onDone?: () => void | Promise<void> }) => {
      if (activeRef.current) return; // ignore double-clicks while a job is in flight
      activeRef.current = true;
      setState("running");
      setError(null);
      try {
        const res = await fetch(enqueueUrl, { method: "POST" });
        if (!res.ok) throw new Error(await readError(res, "Couldn’t start the job — please try again."));
        const { jobId } = (await res.json()) as { jobId?: string };
        if (!jobId) throw new Error("The server did not return a job id.");

        const deadline = Date.now() + MAX_WAIT_MS;
        for (;;) {
          await sleep(POLL_MS);
          if (Date.now() > deadline) throw new Error("This is taking longer than expected — please try again.");
          const s = await fetch(`/api/jobs/${jobId}`);
          if (!s.ok) continue; // transient blip — keep polling (already slept above)
          const job = (await s.json()) as { status?: string; error?: string | null };
          if (job.status === "done") {
            setState("idle");
            if (opts?.onDone) await opts.onDone();
            else router.refresh();
            return;
          }
          if (job.status === "failed") throw new Error(job.error || "The job failed — please try again.");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setState("error");
      } finally {
        activeRef.current = false;
      }
    },
    [router],
  );

  return { state, error, run };
}
