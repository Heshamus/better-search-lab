import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { enqueueJob, claimNextPendingJob, drainOnce, reapStuckJobs } from "@/lib/jobs/queue";
import { jobs } from "@/db/schema";
import { eq } from "drizzle-orm";

let close: () => Promise<void>;
afterEach(() => close?.());

describe("job queue", () => {
  it("enqueues a pending job and returns its id", async () => {
    const t = await createTestDb(); close = t.close;
    const id = await enqueueJob(t.db, { type: "profile_site", projectId: null });
    const [row] = await t.db.select().from(jobs).where(eq(jobs.id, id));
    expect(row.status).toBe("pending");
    expect(row.type).toBe("profile_site");
  });

  it("claims the oldest pending job exactly once (a second claim finds nothing)", async () => {
    const t = await createTestDb(); close = t.close;
    const id = await enqueueJob(t.db, { type: "rank_refresh" });
    const first = await claimNextPendingJob(t.db);
    expect(first?.id).toBe(id);
    const second = await claimNextPendingJob(t.db);
    expect(second).toBeNull(); // already running — not re-claimable
  });

  it("drainOnce runs the handler and records the job done with rows/cost", async () => {
    const t = await createTestDb(); close = t.close;
    await enqueueJob(t.db, { type: "profile_site" });
    const outcome = await drainOnce(t.db, () => async () => ({ rows: 5, cost: 0.02 }));
    expect(outcome).toBe("ran");
    const [row] = await t.db.select().from(jobs);
    expect(row.status).toBe("done");
    expect(row.rowsConsumed).toBe(5);
    expect(row.estCost).toBe("0.02");
  });

  it("drainOnce records a handler throw as failed WITH the real error (never swallowed)", async () => {
    const t = await createTestDb(); close = t.close;
    await enqueueJob(t.db, { type: "profile_site" });
    await drainOnce(t.db, () => async () => { throw new Error("DataForSEO 402 Payment Required"); });
    const [row] = await t.db.select().from(jobs);
    expect(row.status).toBe("failed");
    expect(row.error).toContain("402");
  });

  it("drainOnce fails a job whose type has no registered handler", async () => {
    const t = await createTestDb(); close = t.close;
    await enqueueJob(t.db, { type: "mystery" });
    const outcome = await drainOnce(t.db, () => null);
    expect(outcome).toBe("no-handler");
    const [row] = await t.db.select().from(jobs);
    expect(row.status).toBe("failed");
    expect(row.error).toMatch(/no handler/i);
  });

  it("drainOnce returns 'empty' when nothing is pending", async () => {
    const t = await createTestDb(); close = t.close;
    expect(await drainOnce(t.db, () => async () => ({ rows: 0, cost: 0 }))).toBe("empty");
  });

  it("processes jobs FIFO across successive drains", async () => {
    const t = await createTestDb(); close = t.close;
    await enqueueJob(t.db, { type: "first" });
    await enqueueJob(t.db, { type: "second" });
    const seen: string[] = [];
    const resolve = (type: string) => async () => { seen.push(type); return { rows: 0, cost: 0 }; };
    await drainOnce(t.db, resolve);
    await drainOnce(t.db, resolve);
    expect(await drainOnce(t.db, resolve)).toBe("empty");
    expect(seen).toEqual(["first", "second"]);
  });

  it("reaps a job stuck 'running' past the cutoff so its UI spinner can stop", async () => {
    const t = await createTestDb(); close = t.close;
    const id = await enqueueJob(t.db, { type: "profile_site" });
    await claimNextPendingJob(t.db); // → running
    // Backdate startedAt to 20min ago so it is genuinely stuck for the 10min default.
    await t.db.update(jobs).set({ startedAt: new Date(Date.now() - 20 * 60 * 1000) }).where(eq(jobs.id, id));
    const reaped = await reapStuckJobs(t.db);
    expect(reaped).toBe(1);
    const [row] = await t.db.select().from(jobs).where(eq(jobs.id, id));
    expect(row.status).toBe("failed");
    expect(row.error).toMatch(/timed out/i);
  });

  it("does NOT reap a freshly-running job within the cutoff", async () => {
    const t = await createTestDb(); close = t.close;
    await enqueueJob(t.db, { type: "profile_site" });
    await claimNextPendingJob(t.db);
    const reaped = await reapStuckJobs(t.db, 10 * 60 * 1000); // 10min window — job is young
    expect(reaped).toBe(0);
    const [row] = await t.db.select().from(jobs);
    expect(row.status).toBe("running");
  });

  it("drainOnce hands the handler a progress() that persists and flushes the final message", async () => {
    const t = await createTestDb(); close = t.close;
    const id = await enqueueJob(t.db, { type: "rank_refresh" });
    await drainOnce(t.db, () => async (ctx) => {
      await ctx.progress?.("step 1");
      await ctx.progress?.("step 2"); // throttled: held until flush
      return { rows: 1, cost: 0 };
    });
    const [row] = await t.db.select().from(jobs).where(eq(jobs.id, id));
    expect(row.status).toBe("done");
    expect(row.progress).toBe("step 2");
  });

  it("drainOnce flushes progress even when the handler throws", async () => {
    const t = await createTestDb(); close = t.close;
    const id = await enqueueJob(t.db, { type: "rank_refresh" });
    await drainOnce(t.db, () => async (ctx) => {
      await ctx.progress?.("halfway");
      await ctx.progress?.("about to fail");
      throw new Error("boom");
    });
    const [row] = await t.db.select().from(jobs).where(eq(jobs.id, id));
    expect(row.status).toBe("failed");
    expect(row.error).toBe("boom");
    expect(row.progress).toBe("about to fail");
  });
});
