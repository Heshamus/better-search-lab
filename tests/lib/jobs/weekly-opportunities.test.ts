import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { addKeywords } from "@/lib/keywords";
import { rankSnapshots, keywordMetrics, competitorGaps, opportunities } from "@/db/schema";
import { weeklyOpportunitiesHandler } from "@/lib/jobs/handlers/weekly-opportunities";
import { listOpportunities, mondayOf } from "@/lib/opportunities";

let close: () => Promise<void>;
afterEach(() => close?.());

describe("weeklyOpportunitiesHandler", () => {
  it("writes a scored shortlist from collected signals, idempotent per week", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });
    const [kw] = await addKeywords(t.db, p.id, [{ keyword: "seo reporting software", locationCode: 2840, languageCode: "en" }]);
    await t.db.insert(rankSnapshots).values({ keywordId: kw.id, rankAbsolute: 8, rankGroup: 8, fetchStatus: "ok", ownUrls: [] });
    await t.db.insert(keywordMetrics).values({ keywordId: kw.id, searchVolume: 2000, difficulty: 25 });
    await t.db.insert(competitorGaps).values({ projectId: p.id, competitorDomain: "rival.com", keyword: "automated seo reporting", competitorRank: 3, ourRank: null, volume: 3000, difficulty: 30 });
    const asOf = new Date("2026-08-10T00:00:00Z");
    const r1 = await weeklyOpportunitiesHandler()({ db: t.db, projectId: p.id, asOf });
    expect(r1.rows).toBeGreaterThan(0);
    const rows = await listOpportunities(t.db, p.id, mondayOf("2026-08-10"));
    expect(rows.length).toBe(r1.rows);
    expect(rows[0].score).toBeGreaterThan(0);
    expect(rows[0].weekOf).toBe(mondayOf("2026-08-10"));
    const before = (await t.db.select().from(opportunities)).length;
    await weeklyOpportunitiesHandler()({ db: t.db, projectId: p.id, asOf }); // re-run
    expect((await t.db.select().from(opportunities)).length).toBe(before); // no duplication
  });
});
