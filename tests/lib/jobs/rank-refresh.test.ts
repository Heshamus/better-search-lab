import { describe, it, expect, afterEach, vi } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { addKeywords } from "@/lib/keywords";
import { rankSnapshots, apiUsage } from "@/db/schema";
import { eq } from "drizzle-orm";
import { rankRefreshHandler } from "@/lib/jobs/handlers/rank-refresh";
import { DataForSeoClient } from "@/lib/dataforseo/client";

let close: () => Promise<void>;
afterEach(() => close?.());

describe("rankRefreshHandler", () => {
  it("writes an ok snapshot for a found domain and logs usage", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    const [kw] = await addKeywords(t.db, p.id, [{ keyword: "seo reporting software", locationCode: 2840, languageCode: "en" }]);
    const client = new DataForSeoClient({ login: "L", password: "P" });
    const serp = vi.fn().mockResolvedValue({ items: [{ rankAbsolute: 12, rankGroup: 11, domain: "example-site.com", url: "https://example-site.com/x", serpFeatures: ["featured_snippet"] }], rows: 5 });
    const r = await rankRefreshHandler(client, serp)({ db: t.db, projectId: p.id });
    const [snap] = await t.db.select().from(rankSnapshots).where(eq(rankSnapshots.keywordId, kw.id));
    expect(snap.fetchStatus).toBe("ok");
    expect(snap.rankAbsolute).toBe(12);
    expect(snap.serpFeatures).toContain("featured_snippet");
    expect(r.rows).toBeGreaterThan(0);
    // jobs.est_cost (r.cost) must reconcile with what logApiUsage wrote to api_usage.est_cost —
    // both now derive from the same estimateCost() call instead of a duplicated price literal.
    const usage = await t.db.select().from(apiUsage);
    const totalLogged = usage.reduce((sum: number, u: any) => sum + Number(u.estCost), 0);
    expect(r.cost).toBeCloseTo(totalLogged, 5);
  });
  it("stores fetch_status=failed (no fake rank) when SERP throws", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    const [kw] = await addKeywords(t.db, p.id, [{ keyword: "x", locationCode: 2840, languageCode: "en" }]);
    const client = new DataForSeoClient({ login: "L", password: "P" });
    const serp = vi.fn().mockRejectedValue(new Error("timeout"));
    await rankRefreshHandler(client, serp)({ db: t.db, projectId: p.id });
    const [snap] = await t.db.select().from(rankSnapshots).where(eq(rankSnapshots.keywordId, kw.id));
    expect(snap.fetchStatus).toBe("failed");
    expect(snap.rankAbsolute).toBeNull();
    expect(snap.reason).toContain("timeout");
  });
  it("captures all our-domain URLs in own_urls (cannibalization signal)", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    const [kw] = await addKeywords(t.db, p.id, [{ keyword: "seo tools", locationCode: 2840, languageCode: "en" }]);
    const client = new DataForSeoClient({ login: "L", password: "P" });
    const serp = vi.fn().mockResolvedValue({ rows: 3, items: [
      { rankAbsolute: 4, rankGroup: 4, domain: "example-site.com", url: "https://example-site.com/tools", serpFeatures: [] },
      { rankAbsolute: 7, rankGroup: 7, domain: "example-site.com", url: "https://example-site.com/blog/tools", serpFeatures: [] },
      { rankAbsolute: 2, rankGroup: 2, domain: "rival.com", url: "https://rival.com/x", serpFeatures: [] },
    ]});
    await rankRefreshHandler(client, serp)({ db: t.db, projectId: p.id });
    const [snap] = await t.db.select().from(rankSnapshots).where(eq(rankSnapshots.keywordId, kw.id));
    expect(snap.rankAbsolute).toBe(4); // still best hit
    expect(snap.ownUrls).toEqual(["https://example-site.com/tools", "https://example-site.com/blog/tools"]);
  });
  it("finds rank and own_urls when the stored domain is mixed-case (SERP domains are lowercase)", async () => {
    // Real projects store the domain verbatim ("Example-Site.com"); SERP results are
    // lowercased. A raw === match nulls the rank AND empties own_urls.
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "Example-Site.com" });
    const [kw] = await addKeywords(t.db, p.id, [{ keyword: "seo tools", locationCode: 2840, languageCode: "en" }]);
    const client = new DataForSeoClient({ login: "L", password: "P" });
    const serp = vi.fn().mockResolvedValue({ rows: 2, items: [
      { rankAbsolute: 4, rankGroup: 4, domain: "example-site.com", url: "https://example-site.com/tools", serpFeatures: [] },
      { rankAbsolute: 2, rankGroup: 2, domain: "rival.com", url: "https://rival.com/x", serpFeatures: [] },
    ]});
    await rankRefreshHandler(client, serp)({ db: t.db, projectId: p.id });
    const [snap] = await t.db.select().from(rankSnapshots).where(eq(rankSnapshots.keywordId, kw.id));
    expect(snap.rankAbsolute).toBe(4);                              // was null before the fix
    expect(snap.ownUrls).toEqual(["https://example-site.com/tools"]); // was [] before the fix
  });
});
