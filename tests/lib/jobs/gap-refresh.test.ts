import { describe, it, expect, afterEach, vi } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { competitors, competitorGaps } from "@/db/schema";
import { DataForSeoClient } from "@/lib/dataforseo/client";
import { gapRefreshHandler } from "@/lib/jobs/handlers/gap-refresh";
import { listGapSignals } from "@/lib/competitors";

let close: () => Promise<void>;
afterEach(() => close?.());

function clientReturning(byCompetitor: Record<string, any[]>) {
  const client = new DataForSeoClient({ login: "L", password: "P" });
  vi.spyOn(client, "post").mockImplementation(async (_path: string, body: any) => {
    const target1 = body[0].target1;
    return { status_code: 20000, tasks: [{ status_code: 20000, result: [{ items: byCompetitor[target1] ?? [] }] }] };
  });
  return client;
}
const gapItem = (keyword: string, compRank: number | null, volume: number) => ({
  keyword_data: { keyword, keyword_info: { search_volume: volume }, keyword_properties: { keyword_difficulty: 30 } },
  first_domain_serp_element: compRank == null ? null : { rank_absolute: compRank },
  second_domain_serp_element: null, // we don't rank → ourRank null → a gap
});

describe("gapRefreshHandler", () => {
  it("persists per-competitor gaps and aggregates competitorCount across competitors", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    await t.db.insert(competitors).values([
      { projectId: p.id, domain: "rival-a.com" }, { projectId: p.id, domain: "rival-b.com" },
    ]);
    const client = clientReturning({
      "rival-a.com": [gapItem("seo reporting", 3, 1200), gapItem("rank tracker", 6, 800)],
      "rival-b.com": [gapItem("seo reporting", 5, 1200)], // same keyword from a 2nd competitor
    });
    const res = await gapRefreshHandler(client)({ db: t.db, projectId: p.id });
    expect(res.rows).toBeGreaterThan(0);
    expect((await t.db.select().from(competitorGaps)).length).toBe(3);
    const signals = await listGapSignals(t.db, p.id);
    const reporting = signals.find((s) => s.keyword === "seo reporting")!;
    expect(reporting.competitorCount).toBe(2);   // both rivals rank, we don't
    const tracker = signals.find((s) => s.keyword === "rank tracker")!;
    expect(tracker.competitorCount).toBe(1);
  });

  it("re-run replaces a competitor's rows (idempotent full refresh)", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    await t.db.insert(competitors).values({ projectId: p.id, domain: "rival-a.com" });
    const c1 = clientReturning({ "rival-a.com": [gapItem("seo reporting", 3, 1200)] });
    await gapRefreshHandler(c1)({ db: t.db, projectId: p.id });
    const c2 = clientReturning({ "rival-a.com": [gapItem("rank tracker", 6, 800)] });
    await gapRefreshHandler(c2)({ db: t.db, projectId: p.id });
    const rows = await t.db.select().from(competitorGaps);
    expect(rows).toHaveLength(1);
    expect(rows[0].keyword).toBe("rank tracker"); // old row gone, not accumulated
  });
});
