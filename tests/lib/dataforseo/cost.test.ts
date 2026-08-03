import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { apiUsage } from "@/db/schema";
import { estimateCost, logApiUsage } from "@/lib/dataforseo/cost";

let close: () => Promise<void>;
afterEach(() => close?.());

describe("cost", () => {
  it("estimates SERP cost per request", () => {
    expect(estimateCost("/v3/serp/google/organic/live/advanced", 100)).toBeCloseTo(0.002, 4);
  });
  it("returns distinct per-endpoint prices, so deleting a PRICES entry breaks this test", () => {
    const serpCost = estimateCost("/v3/serp/google/organic/live/advanced", 1);
    const overviewCost = estimateCost("/v3/dataforseo_labs/google/keyword_overview/live", 500);
    expect(serpCost).toBeCloseTo(0.002, 4);
    expect(overviewCost).toBeCloseTo(0.012, 4);
    expect(serpCost).not.toBe(overviewCost);
  });
  it("logs a usage row", async () => {
    const t = await createTestDb(); close = t.close;
    await logApiUsage(t.db, { endpoint: "/v3/serp/google/organic/live/advanced", rows: 100 });
    const rows = await t.db.select().from(apiUsage);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].estCost)).toBeCloseTo(0.002, 4);
  });
});
