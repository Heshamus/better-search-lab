import { describe, it, expect, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/test-db";
import { jobs } from "@/db/schema";
import { runJob } from "@/lib/jobs/runner";

let close: () => Promise<void>;
afterEach(() => close?.());

describe("runJob", () => {
  it("runs once and records cost", async () => {
    const t = await createTestDb(); close = t.close;
    const handler = vi.fn().mockResolvedValue({ rows: 10, cost: 0.02 });
    const r = await runJob(t.db, { type: "health", date: "2026-08-02", handler });
    expect(r).toBe("done");
    const [row] = await t.db.select().from(jobs);
    expect(row.status).toBe("done");
    expect(Number(row.estCost)).toBeCloseTo(0.02);
  });

  it("skips a duplicate (type, project, date) without re-running", async () => {
    const t = await createTestDb(); close = t.close;
    const handler = vi.fn().mockResolvedValue({ rows: 0, cost: 0 });
    await runJob(t.db, { type: "health", date: "2026-08-02", handler });
    const second = await runJob(t.db, { type: "health", date: "2026-08-02", handler });
    expect(second).toBe("skipped");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("marks failed and stores the error", async () => {
    const t = await createTestDb(); close = t.close;
    const handler = vi.fn().mockRejectedValue(new Error("boom"));
    const r = await runJob(t.db, { type: "health", date: "2026-08-03", handler });
    expect(r).toBe("failed");
    const rows = await t.db.select().from(jobs);
    expect(rows[0].error).toContain("boom");
  });

  it("re-runs a job whose prior attempt failed (not skipped)", async () => {
    const t = await createTestDb(); close = t.close;
    const failing = vi.fn().mockRejectedValue(new Error("boom"));
    const succeeding = vi.fn().mockResolvedValue({ rows: 5, cost: 0.01 });
    const first = await runJob(t.db, { type: "rank", date: "2026-08-02", handler: failing });
    expect(first).toBe("failed");
    const second = await runJob(t.db, { type: "rank", date: "2026-08-02", handler: succeeding });
    expect(second).toBe("done"); // re-claimed, not skipped
    expect(succeeding).toHaveBeenCalledTimes(1);
    const [row] = await t.db.select().from(jobs);
    expect(row.status).toBe("done");
    expect(row.error).toBeNull(); // error cleared on re-claim
  });

  it("runJob supplies progress() keyed by the job's dedupeKey", async () => {
    const t = await createTestDb(); close = t.close;
    const outcome = await runJob(t.db, {
      type: "rank_refresh", projectId: undefined, date: "2026-09-07",
      handler: async (ctx) => { await ctx.progress?.("Checking keyword 1 of 1"); return { rows: 1, cost: 0 }; },
    });
    expect(outcome).toBe("done");
    const [row] = await t.db.select().from(jobs).where(eq(jobs.dedupeKey, "rank_refresh:global:2026-09-07"));
    expect(row.progress).toBe("Checking keyword 1 of 1");
  });
});
