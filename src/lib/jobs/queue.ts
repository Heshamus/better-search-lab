import { jobs } from "@/db/schema";
import { and, asc, eq, lt } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { makeProgressWriter } from "./progress";

// Async job queue over the existing `jobs` table.
//
// WHY: on-demand actions (profile a site, refresh rankings, competitor intel)
// call DataForSEO + DeepSeek and take 30s–3.5min. Running them synchronously
// inside the HTTP request made the button ALWAYS fail — the auth proxy in front
// of the app times out around 30s, so a job that finishes fine server-side
// (observed: profile_site done in 195s) still surfaces to the user as an error.
//
// FIX: the route ENQUEUES a pending job and returns immediately; the worker
// drains pending jobs one at a time and runs the handler; the UI polls the job's
// status. This is the same async-with-progress model Semrush/Ahrefs use for
// audits, and it removes the timeout class of failure entirely.

export interface JobContext {
  db: unknown;
  projectId?: string;
  /** Report a progress line (spec §11.2). Optional so handlers can be unit-tested with a bare `{ db }`. */
  progress?: (message: string) => Promise<void>;
}
export type JobHandler = (ctx: JobContext) => Promise<{ rows: number; cost: number }>;
export type HandlerResolver = (type: string, payload: Record<string, unknown>) => JobHandler | null;

export interface ClaimedJob {
  id: string;
  type: string;
  projectId: string | null;
  payload: Record<string, unknown>;
}

// How long a job may stay "running" before the reaper calls it dead. The slowest
// real job (profile_site) tops out ~3.5min; 10min is generous headroom so we only
// ever reap a genuinely stalled/crashed worker, never a slow-but-alive job.
const STUCK_JOB_MS = 10 * 60 * 1000;

/**
 * Enqueue a pending job and return its id. Fast (a single INSERT) — this is what
 * the HTTP route awaits, so the request returns in well under a second. The
 * dedupeKey is made unique per enqueue (uuid) so re-running an action is never
 * silently "skipped" as a duplicate.
 */
export async function enqueueJob(
  db: any,
  spec: { type: string; projectId?: string | null; payload?: Record<string, unknown> },
): Promise<string> {
  const [row] = await db
    .insert(jobs)
    .values({
      type: spec.type,
      projectId: spec.projectId ?? null,
      dedupeKey: `${spec.type}:${spec.projectId ?? "global"}:${randomUUID()}`,
      payload: spec.payload ?? {},
      status: "pending",
      scheduledFor: new Date(),
    })
    .returning({ id: jobs.id });
  return row.id;
}

/**
 * Atomically claim the oldest pending job: select it, then flip it to "running"
 * guarded by `status='pending'`. If the guarded UPDATE matches zero rows another
 * consumer beat us to it, so we report "nothing claimed" and try again next tick.
 * The guarded update (not a bare update) is what makes this safe even if more
 * than one worker ever runs — only one UPDATE can match the pending row.
 */
export async function claimNextPendingJob(db: any): Promise<ClaimedJob | null> {
  const [pending] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.status, "pending"))
    .orderBy(asc(jobs.scheduledFor))
    .limit(1);
  if (!pending) return null;

  const claimed = await db
    .update(jobs)
    .set({ status: "running", startedAt: new Date() })
    .where(and(eq(jobs.id, pending.id), eq(jobs.status, "pending")))
    .returning({ id: jobs.id });
  if (claimed.length === 0) return null; // lost the race — retry next tick

  return {
    id: pending.id,
    type: pending.type,
    projectId: pending.projectId ?? null,
    payload: (pending.payload ?? {}) as Record<string, unknown>,
  };
}

/** Mark a "running" job whose startedAt is older than STUCK_JOB_MS as failed, so
 *  a crashed/killed worker can't leave a job (and its UI spinner) stuck forever. */
export async function reapStuckJobs(db: any, maxRunMs: number = STUCK_JOB_MS): Promise<number> {
  const cutoff = new Date(Date.now() - maxRunMs);
  const reaped = await db
    .update(jobs)
    .set({ status: "failed", finishedAt: new Date(), error: "job timed out (worker stalled or was restarted)" })
    .where(and(eq(jobs.status, "running"), lt(jobs.startedAt, cutoff)))
    .returning({ id: jobs.id });
  return reaped.length;
}

export type DrainOutcome = "empty" | "ran" | "no-handler";

/**
 * Claim one pending job and run it to completion (or failure). Returns:
 * - "empty": no pending job was available.
 * - "no-handler": a job type with no registered handler was claimed and failed.
 * - "ran": a job was claimed and its handler resolved (done or failed is recorded).
 * Never throws for a handler failure — the failure is recorded on the job row so
 * the UI can show the real error.
 */
export async function drainOnce(db: any, resolve: HandlerResolver): Promise<DrainOutcome> {
  const job = await claimNextPendingJob(db);
  if (!job) return "empty";

  const handler = resolve(job.type, job.payload);
  if (!handler) {
    await db
      .update(jobs)
      .set({ status: "failed", finishedAt: new Date(), error: `no handler registered for job type "${job.type}"` })
      .where(eq(jobs.id, job.id));
    return "no-handler";
  }

  const writer = makeProgressWriter(db, { id: job.id });
  try {
    const { rows, cost } = await handler({ db, projectId: job.projectId ?? undefined, progress: writer.progress });
    await writer.flush();
    await db
      .update(jobs)
      .set({ status: "done", finishedAt: new Date(), rowsConsumed: rows, estCost: String(cost) })
      .where(eq(jobs.id, job.id));
  } catch (e: any) {
    await writer.flush().catch(() => undefined); // never mask the real failure with a flush error
    await db
      .update(jobs)
      .set({ status: "failed", finishedAt: new Date(), error: String(e?.message ?? e) })
      .where(eq(jobs.id, job.id));
  }
  return "ran";
}
