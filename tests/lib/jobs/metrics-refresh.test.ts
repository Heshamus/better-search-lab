import { describe, it, expect, afterEach, vi } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { addKeywords } from "@/lib/keywords";
import { keywordMetrics, apiUsage } from "@/db/schema";
import { metricsRefreshHandler } from "@/lib/jobs/handlers/metrics-refresh";
import { DataForSeoClient } from "@/lib/dataforseo/client";

let close: () => Promise<void>;
afterEach(() => close?.());

describe("metricsRefreshHandler", () => {
  it("bulk-upserts keyword_metrics for tracked keywords, idempotently", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });
    await addKeywords(t.db, p.id, [
      { keyword: "a", locationCode: 2840, languageCode: "en" },
      { keyword: "b", locationCode: 2840, languageCode: "en" },
    ]);
    const client = new DataForSeoClient({ login: "L", password: "P" });
    const overview = vi.fn().mockResolvedValue({ items: [
      { keyword: "a", searchVolume: 100, cpc: 1.2, competition: 0.5, difficulty: 20 },
      { keyword: "b", searchVolume: 50, cpc: 0.9, competition: 0.3, difficulty: 15 },
    ], rows: 2 });
    const r = await metricsRefreshHandler(client, overview)({ db: t.db, projectId: p.id });
    expect(r.rows).toBe(2);
    // jobs.est_cost (r.cost) must reconcile with what logApiUsage wrote to api_usage.est_cost —
    // both now derive from the same estimateCost() call instead of two diverging formulas.
    const usage = await t.db.select().from(apiUsage);
    const totalLogged = usage.reduce((sum: number, u: any) => sum + Number(u.estCost), 0);
    expect(r.cost).toBeCloseTo(totalLogged, 5);
    let rows = await t.db.select().from(keywordMetrics);
    expect(rows).toHaveLength(2);
    expect(rows.find((x: any) => x.searchVolume === 100)).toBeTruthy();
    // re-run → still 2 rows (upsert on keywordId PK, not duplicate)
    await metricsRefreshHandler(client, overview)({ db: t.db, projectId: p.id });
    rows = await t.db.select().from(keywordMetrics);
    expect(rows).toHaveLength(2);
  });
});
