// tests/phase-1b-smoke.test.ts
//
// Capstone offline E2E for Phase 1b: proves the whole opportunity-engine
// pipeline composes through the REAL job handler and REAL persistence layer
// — createProject -> addKeywords -> (seeded signals) -> weeklyOpportunitiesHandler
// -> listOpportunities — with zero network (pglite only).
//
// The differentiator under test is the niche RELEVANCE GATE: an off-niche
// noise gap keyword ("best plumbing near me") is seeded so that it clears the
// gap() detector's own gate (>=2 distinct competitors, low/winnable KD) —
// proving that it is the relevance gate, not the detector, that removes it.
import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { addKeywords } from "@/lib/keywords";
import { rankSnapshots, keywordMetrics, competitorGaps, apiUsage } from "@/db/schema";
import { weeklyOpportunitiesHandler } from "@/lib/jobs/handlers/weekly-opportunities";
import { listOpportunities, mondayOf } from "@/lib/opportunities";

let close: () => Promise<void>;
afterEach(() => close?.());

describe("phase-1b pipeline (offline)", () => {
  it("composes createProject -> addKeywords -> signals -> weeklyOpportunitiesHandler -> listOpportunities: scored, relevance-filtered shortlist, zero network", async () => {
    const t = await createTestDb(); close = t.close;

    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });

    // On-niche tracked keyword -> niche profile = {seo, reporting, software}.
    const [kw] = await addKeywords(t.db, p.id, [
      { keyword: "seo reporting software", locationCode: 2840, languageCode: "en" },
    ]);

    // Ok snapshot at rankAbsolute=8 (in [5,20]) -> striking-distance candidate.
    await t.db.insert(rankSnapshots).values({
      keywordId: kw.id, rankAbsolute: 8, rankGroup: 8, fetchStatus: "ok", ownUrls: [],
    });
    await t.db.insert(keywordMetrics).values({ keywordId: kw.id, searchVolume: 2000, difficulty: 25 });

    // On-niche gap: TWO distinct competitors rank for "automated seo reporting",
    // we don't (ourRank: null) -> a gap candidate (clears gap()'s MIN_COMPETITORS
    // gate) that also clears the relevance gate (shares seo/reporting tokens).
    await t.db.insert(competitorGaps).values([
      { projectId: p.id, competitorDomain: "rival-a.com", keyword: "automated seo reporting", competitorRank: 3, ourRank: null, volume: 3000, difficulty: 30 },
      { projectId: p.id, competitorDomain: "rival-b.com", keyword: "automated seo reporting", competitorRank: 5, ourRank: null, volume: 3000, difficulty: 30 },
    ]);

    // OFF-niche noise: also TWO distinct competitors + low/winnable KD, so it
    // clears the gap() detector's OWN gate exactly like the row above -- the
    // ONLY thing standing between this and the shortlist is the relevance gate.
    await t.db.insert(competitorGaps).values([
      { projectId: p.id, competitorDomain: "noise-a.com", keyword: "best plumbing near me", competitorRank: 2, ourRank: null, volume: 5000, difficulty: 20 },
      { projectId: p.id, competitorDomain: "noise-b.com", keyword: "best plumbing near me", competitorRank: 4, ourRank: null, volume: 5000, difficulty: 20 },
    ]);

    const asOf = new Date("2026-08-10T00:00:00Z");
    const beforeUsage = (await t.db.select().from(apiUsage)).length;

    const result = await weeklyOpportunitiesHandler()({ db: t.db, projectId: p.id, asOf });
    expect(result.cost).toBe(0); // pure over stored data -- no DataForSEO call

    const rows = await listOpportunities(t.db, p.id, mondayOf("2026-08-10"));

    // A non-empty, score-DESC-sorted shortlist.
    expect(rows.length).toBeGreaterThan(0);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].score).toBeGreaterThanOrEqual(rows[i].score);
    }

    // INCLUDES the on-niche gap, with its keyword persisted and keywordId null
    // (gap candidates aren't tracked keywords).
    const gapRow = rows.find((r: any) => r.type === "gap" && r.keyword === "automated seo reporting");
    expect(gapRow).toBeTruthy();
    expect(gapRow!.keyword).toBe("automated seo reporting");
    expect(gapRow!.keywordId).toBeNull();

    // INCLUDES the striking-distance keyword.
    const strikingRow = rows.find((r: any) => r.type === "striking_distance" && r.keywordId === kw.id);
    expect(strikingRow).toBeTruthy();

    // EXCLUDES the off-niche plumbing noise -- proves the relevance gate, not
    // the gap detector's own gate, is what removes it (both gap rows clear the
    // detector's >=2-competitor/winnable-KD gate identically).
    const noiseRow = rows.find((r: any) => r.keyword === "best plumbing near me");
    expect(noiseRow).toBeUndefined();

    // Every surfaced row is explainable and score-transparent.
    for (const row of rows) {
      expect(typeof row.why).toBe("string");
      expect(row.why.length).toBeGreaterThan(0);
      expect(row.scoreBreakdown).toBeTruthy();
      expect(Object.keys(row.scoreBreakdown as Record<string, number>).length).toBeGreaterThan(0);
    }

    expect(rows[0].weekOf).toBe(mondayOf("2026-08-10"));

    // api_usage is UNTOUCHED -- the weekly job makes no DataForSEO call.
    const afterUsage = (await t.db.select().from(apiUsage)).length;
    expect(afterUsage).toBe(beforeUsage);
    expect(afterUsage).toBe(0);
  });
});
