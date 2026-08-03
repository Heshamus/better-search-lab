import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { competitorGaps, rankSnapshots, keywords } from "@/db/schema";

let close: () => Promise<void>;
afterEach(() => close?.());

describe("opportunity-signals schema", () => {
  it("competitor_gaps round-trips", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });
    await t.db.insert(competitorGaps).values({
      projectId: p.id, competitorDomain: "rival.com", keyword: "seo reporting",
      competitorRank: 4, ourRank: null, volume: 1200, difficulty: 34,
    });
    const rows = await t.db.select().from(competitorGaps);
    expect(rows).toHaveLength(1);
    expect(rows[0].ourRank).toBeNull();
    expect(rows[0].competitorRank).toBe(4);
  });

  it("rank_snapshots.own_urls defaults to [] and stores arrays", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });
    const [kw] = await t.db.insert(keywords).values({
      projectId: p.id, keyword: "k", locationCode: 2840, languageCode: "en",
    }).returning();
    const [snap] = await t.db.insert(rankSnapshots).values({ keywordId: kw.id }).returning();
    expect(snap.ownUrls).toEqual([]);
    const [snap2] = await t.db.insert(rankSnapshots).values({
      keywordId: kw.id, ownUrls: ["https://harperflow.io/a", "https://harperflow.io/b"],
    }).returning();
    expect(snap2.ownUrls).toHaveLength(2);
  });
});
