import { describe, it, expect, afterEach, vi } from "vitest";
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
});
