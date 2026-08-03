// tests/phase-1c-smoke.test.ts
//
// Capstone offline E2E for Phase 1c: proves the dashboard's DATA layer
// composes end-to-end over ONE seeded world — every read fn a page calls
// (computeHealthMetrics, listRankings, listOpportunities, usageSummary,
// listGapSignals) resolves real data from real seeded signals + the real
// weeklyOpportunitiesHandler, with zero network (pglite only). Mirrors
// phase-1b-smoke's seeding, then layers on the Phase-1c read fns the pages
// (src/app/(app)/*/page.tsx) call — those pages are thin wrappers over these
// fns, so this is the proof the whole read layer is wired correctly.
//
// Each read fn is called with the EXACT arity its production page uses
// (see opportunities/rankings/usage/competitors page.tsx), e.g.
// `listOpportunities(db, projectId)` with no weekOf — proving the
// default-latest-week path, not just the explicit-weekOf path Task 9 tested.
import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { addKeywords } from "@/lib/keywords";
import { rankSnapshots, keywordMetrics, competitorGaps, apiUsage } from "@/db/schema";
import { weeklyOpportunitiesHandler } from "@/lib/jobs/handlers/weekly-opportunities";
import { computeHealthMetrics } from "@/lib/dashboard-metrics";
import { listRankings } from "@/lib/rankings";
import { listOpportunities } from "@/lib/opportunities";
import { usageSummary } from "@/lib/usage";
import { listGapSignals } from "@/lib/competitors";
import type { OpportunityRow } from "@/components/opportunity-card";

let close: () => Promise<void>;
afterEach(() => close?.());

const d = (s: string) => new Date(s + "T00:00:00Z");

describe("phase-1c dashboard read-layer (offline)", () => {
  it("composes createProject -> addKeywords -> signals -> weeklyOpportunitiesHandler -> every page read fn: real data, zero network", async () => {
    const t = await createTestDb(); close = t.close;

    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });

    // On-niche tracked keyword -> niche profile = {seo, reporting, software}.
    const [kw] = await addKeywords(t.db, p.id, [
      { keyword: "seo reporting software", locationCode: 2840, languageCode: "en" },
    ]);

    // Two ok snapshots straddling the asOf-7d cutoff (2026-08-03): the older
    // one (2026-07-25, rank 12) is the only candidate at-or-before the 7d
    // cutoff, the newer one (2026-08-09, rank 8) is the latest at-or-before
    // asOf -- two DISTINCT snapshots, so deltaForKeyword has real points to
    // diff (12 -> 8, delta7 = 4), and the latest rank (8) sits in [5,20] for
    // the striking-distance detector. Both rows keyed on kw.id -- the only
    // tracked keyword, so no keywordId-mismatch risk.
    await t.db.insert(rankSnapshots).values([
      { keywordId: kw.id, capturedAt: d("2026-07-25"), rankAbsolute: 12, rankGroup: 12, fetchStatus: "ok", ownUrls: [] },
      { keywordId: kw.id, capturedAt: d("2026-08-09"), rankAbsolute: 8, rankGroup: 8, fetchStatus: "ok", ownUrls: [] },
    ]);
    await t.db.insert(keywordMetrics).values({ keywordId: kw.id, searchVolume: 2000, difficulty: 25 });

    // On-niche gap: TWO distinct competitors rank for "automated seo
    // reporting", we don't (ourRank: null) -> clears gap()'s MIN_COMPETITORS
    // gate (>=2) and winnable-KD gate (30 <= 60), and clears the relevance
    // gate (shares seo/reporting tokens with the niche profile: 2/3 >= 0.34).
    await t.db.insert(competitorGaps).values([
      { projectId: p.id, competitorDomain: "rival-a.com", keyword: "automated seo reporting", competitorRank: 3, ourRank: null, volume: 3000, difficulty: 30 },
      { projectId: p.id, competitorDomain: "rival-b.com", keyword: "automated seo reporting", competitorRank: 5, ourRank: null, volume: 3000, difficulty: 30 },
    ]);

    // OFF-niche noise gap, clearing the SAME detector gate (>=2 competitors,
    // winnable KD) as the row above -- proves listOpportunities' shortlist
    // excludes it via the relevance gate, not a lucky detector rejection,
    // while listGapSignals (a raw, relevance-agnostic signal read) still
    // reports it as a real gap signal.
    await t.db.insert(competitorGaps).values([
      { projectId: p.id, competitorDomain: "noise-a.com", keyword: "best plumbing near me", competitorRank: 2, ourRank: null, volume: 5000, difficulty: 20 },
      { projectId: p.id, competitorDomain: "noise-b.com", keyword: "best plumbing near me", competitorRank: 4, ourRank: null, volume: 5000, difficulty: 20 },
    ]);

    // api_usage row inside asOf's month -> usageSummary.total > 0 and
    // computeHealthMetrics's `spend` tile is a real, non-zero amount.
    await t.db.insert(apiUsage).values({
      occurredAt: d("2026-08-05"), projectId: p.id, endpoint: "serp", rows: 5, estCost: "3.50",
    });

    const asOf = d("2026-08-10");

    const result = await weeklyOpportunitiesHandler()({ db: t.db, projectId: p.id, asOf });
    expect(result.cost).toBe(0); // pure over stored data -- no DataForSEO call
    expect(result.rows).toBeGreaterThan(0);

    // --- computeHealthMetrics(db, projectId, asOf) -- opportunities page's health strip ---
    const health = await computeHealthMetrics(t.db, p.id, asOf);
    // All 5 strings present.
    expect(Object.keys(health).sort()).toEqual(
      ["avgPosition", "estTraffic", "keywordsTracked", "spend", "visibility"].sort(),
    );
    // Rank-based tiles are real (a real ok snapshot was seeded) -- never "—".
    expect(health.visibility).not.toBe("—");
    expect(health.avgPosition).not.toBe("—");
    expect(health.estTraffic).not.toBe("—");
    // Exact values where the arithmetic is simple/safe to hand-verify:
    // avgPosition = the single ok rank (8) formatted "8.0"; visibility =
    // 101-8 = 93 -> "93/100". estTraffic depends on the CTR-by-position
    // lookup table -- assert shape + non-zero instead of a hand-computed
    // number, to avoid baking a fragile magic constant into the test.
    expect(health.avgPosition).toBe("8.0");
    expect(health.visibility).toBe("93/100");
    expect(health.estTraffic).toMatch(/^~\d+\/mo$/);
    expect(health.estTraffic).not.toBe("~0/mo");
    expect(health.keywordsTracked).toBe("1");
    expect(health.spend).toBe("$3.50");

    // --- listRankings(db, projectId, asOf) -- rankings page ---
    const rankingRows = await listRankings(t.db, p.id, asOf);
    const rankingRow = rankingRows.find((r) => r.keywordId === kw.id);
    expect(rankingRow).toBeTruthy();
    expect(rankingRow!.fetchStatus).toBe("ok");
    expect(rankingRow!.rankAbsolute).toBe(8);
    expect(rankingRow!.volume).toBe(2000);
    expect(rankingRow!.difficulty).toBe(25);
    // The differentiator: a real, non-null delta7 for the multi-snapshot keyword.
    expect(rankingRow!.delta7).not.toBeNull();
    expect(rankingRow!.delta7).toBe(4); // 12 -> 8

    // --- listOpportunities(db, projectId) -- opportunities page (default-latest-week path) ---
    const opportunityRows = await listOpportunities(t.db, p.id);
    expect(opportunityRows.length).toBeGreaterThan(0);

    // Every row is explainable (non-empty `why`) -- what OpportunityCard renders.
    for (const row of opportunityRows) {
      expect(typeof row.why).toBe("string");
      expect(row.why.length).toBeGreaterThan(0);
    }

    // Groupable by `type` -- exactly what OpportunitiesPage does to build sections.
    const byType = new Map<string, (typeof opportunityRows)[number][]>();
    for (const row of opportunityRows) {
      const group = byType.get(row.type) ?? [];
      group.push(row);
      byType.set(row.type, group);
    }

    // Includes the on-niche gap, carrying the Phase-1b metric fields.
    const gapRow = opportunityRows.find(
      (r: OpportunityRow) => r.type === "gap" && r.keyword === "automated seo reporting",
    );
    expect(gapRow).toBeTruthy();
    expect(gapRow!.volume).toBe(3000);
    expect(gapRow!.difficulty).toBe(30);
    expect(gapRow!.currentPosition).toBeNull(); // gap candidates aren't tracked keywords -- no position
    expect(gapRow!.trend).toBeNull();
    expect(byType.get("gap")?.length).toBeGreaterThan(0);

    // Includes the striking-distance keyword, carrying the Phase-1b metric fields.
    const strikingRow = opportunityRows.find(
      (r: OpportunityRow) => r.type === "striking_distance" && r.keywordId === kw.id,
    );
    expect(strikingRow).toBeTruthy();
    expect(strikingRow!.volume).toBe(2000);
    expect(strikingRow!.difficulty).toBe(25);
    expect(strikingRow!.currentPosition).toBe(8);
    expect(strikingRow!.trend).toBe(4);
    expect(byType.get("striking_distance")?.length).toBeGreaterThan(0);

    // EXCLUDES the off-niche plumbing noise from the shortlist -- proves the
    // relevance gate (not a lucky detector-gate miss, since both gap rows
    // clear gap()'s >=2-competitor/winnable-KD gate identically).
    expect(
      opportunityRows.find((r: OpportunityRow) => r.keyword === "best plumbing near me"),
    ).toBeUndefined();

    // --- usageSummary(db, projectId) -- usage page ---
    const usage = await usageSummary(t.db, p.id);
    expect(usage.total).toBeGreaterThan(0);
    expect(usage.total).toBeCloseTo(3.5);

    // --- listGapSignals(db, projectId) -- competitors page ---
    // Relevance-agnostic raw signal read: reports the on-niche gap...
    const gapSignal = (await listGapSignals(t.db, p.id)).find((g) => g.keyword === "automated seo reporting");
    expect(gapSignal).toBeTruthy();
    expect(gapSignal!.competitorCount).toBe(2);
    expect(gapSignal!.volume).toBe(3000);
    expect(gapSignal!.difficulty).toBe(30);
  });
});
