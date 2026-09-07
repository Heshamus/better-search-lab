import { describe, it, expect, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/test-db";
import { jobs } from "@/db/schema";
import { enqueueJob } from "@/lib/jobs/queue";
import { makeProgressWriter } from "@/lib/jobs/progress";

let close: () => Promise<void>;
afterEach(() => { close?.(); });

async function progressOf(db: any, id: string): Promise<string | null> {
  const [row] = await db.select({ progress: jobs.progress }).from(jobs).where(eq(jobs.id, id));
  return row?.progress ?? null;
}

describe("makeProgressWriter", () => {
  it("writes the first message immediately and throttles the rest to one write per interval", async () => {
    const t = await createTestDb(); close = t.close;
    const id = await enqueueJob(t.db, { type: "rank_refresh" });
    let clock = 1_000_000;
    const w = makeProgressWriter(t.db, { id }, { minIntervalMs: 1000, now: () => clock });
    await w.progress("Checking keyword 1 of 3");
    expect(await progressOf(t.db, id)).toBe("Checking keyword 1 of 3");
    clock += 200;
    await w.progress("Checking keyword 2 of 3"); // inside the window: held, not written
    expect(await progressOf(t.db, id)).toBe("Checking keyword 1 of 3");
    clock += 900;
    await w.progress("Checking keyword 3 of 3"); // window elapsed: the latest message wins
    expect(await progressOf(t.db, id)).toBe("Checking keyword 3 of 3");
  });

  it("flush() always lands the last held message", async () => {
    const t = await createTestDb(); close = t.close;
    const id = await enqueueJob(t.db, { type: "rank_refresh" });
    let clock = 0;
    const w = makeProgressWriter(t.db, { id }, { minIntervalMs: 1000, now: () => clock });
    await w.progress("a");
    clock += 10;
    await w.progress("b");
    expect(await progressOf(t.db, id)).toBe("a");
    await w.flush();
    expect(await progressOf(t.db, id)).toBe("b");
    await w.flush(); // nothing pending: no-op
    expect(await progressOf(t.db, id)).toBe("b");
  });

  it("targets a job by dedupeKey for the cron runner", async () => {
    const t = await createTestDb(); close = t.close;
    await t.db.insert(jobs).values({ type: "health", dedupeKey: "health:global:2026-09-07", status: "running", startedAt: new Date() });
    const w = makeProgressWriter(t.db, { dedupeKey: "health:global:2026-09-07" }, { now: () => 0 });
    await w.progress("Pinging");
    const [row] = await t.db.select({ progress: jobs.progress }).from(jobs).where(eq(jobs.dedupeKey, "health:global:2026-09-07"));
    expect(row.progress).toBe("Pinging");
  });
});
