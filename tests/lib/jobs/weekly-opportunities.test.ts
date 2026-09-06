import { describe, it, expect, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { addKeywords } from "@/lib/keywords";
import { rankSnapshots, keywordMetrics, competitorGaps, opportunities, projects } from "@/db/schema";
import { weeklyOpportunitiesHandler } from "@/lib/jobs/handlers/weekly-opportunities";
import { listOpportunities, mondayOf, setOpportunityStatus, upsertOpportunities } from "@/lib/opportunities";

let close: () => Promise<void>;
afterEach(() => close?.());

describe("weeklyOpportunitiesHandler", () => {
  it("writes a scored shortlist from collected signals, idempotent per week", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
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

  it("persists the keyword string on gap-type rows, since gap candidates have keywordId: null", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    // Tracked keyword only builds the niche profile ({seo, reporting, software}) — no
    // rank snapshot/metrics needed since this test is about the GAP candidate's own
    // persisted fields, not a striking-distance one.
    await addKeywords(t.db, p.id, [{ keyword: "seo reporting software", locationCode: 2840, languageCode: "en" }]);
    // Two DISTINCT competitors ranking for the SAME on-niche keyword, neither of which
    // we rank for → competitorCount === 2, clearing gap()'s MIN_COMPETITORS gate.
    await t.db.insert(competitorGaps).values([
      { projectId: p.id, competitorDomain: "rival-a.com", keyword: "automated seo reporting", competitorRank: 3, ourRank: null, volume: 3000, difficulty: 30 },
      { projectId: p.id, competitorDomain: "rival-b.com", keyword: "automated seo reporting", competitorRank: 5, ourRank: null, volume: 3000, difficulty: 30 },
    ]);
    const asOf = new Date("2026-08-10T00:00:00Z");
    await weeklyOpportunitiesHandler()({ db: t.db, projectId: p.id, asOf });
    const rows = await listOpportunities(t.db, p.id, mondayOf("2026-08-10"));
    const gapRow = rows.find((r: any) => r.type === "gap");
    expect(gapRow).toBeTruthy();
    expect(gapRow!.keyword).toBe("automated seo reporting"); // recoverable even with no FK
    expect(gapRow!.keywordId).toBeNull(); // gap candidates aren't tracked keywords
    // The §8 advisor card's metrics row (Vol/Pos/KD/trend) needs these persisted —
    // gap cards can't re-join to keywords (keywordId is null), so the row must be
    // self-contained. volume/difficulty come straight from the gap signal;
    // currentPosition/trend are null (no rank history for an untracked keyword).
    expect(gapRow!.volume).toBe(3000);
    expect(gapRow!.difficulty).toBe(30);
    expect(gapRow!.currentPosition).toBeNull();
    expect(gapRow!.trend).toBeNull();
  });

  it("a user-actioned row survives a re-run of the same week (status-scoped delete)", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    const [kw] = await addKeywords(t.db, p.id, [{ keyword: "seo reporting software", locationCode: 2840, languageCode: "en" }]);
    await t.db.insert(rankSnapshots).values({ keywordId: kw.id, rankAbsolute: 8, rankGroup: 8, fetchStatus: "ok", ownUrls: [] });
    await t.db.insert(keywordMetrics).values({ keywordId: kw.id, searchVolume: 2000, difficulty: 25 });
    const asOf = new Date("2026-08-10T00:00:00Z");

    await weeklyOpportunitiesHandler()({ db: t.db, projectId: p.id, asOf });
    const firstRun = await t.db.select().from(opportunities);
    expect(firstRun.length).toBeGreaterThan(0);
    const target = firstRun[0];
    await setOpportunityStatus(t.db, target.id, "tracked");

    await weeklyOpportunitiesHandler()({ db: t.db, projectId: p.id, asOf }); // re-run, same week

    const after = await t.db.select().from(opportunities);
    const stillThere = after.find((r: any) => r.id === target.id);
    expect(stillThere).toBeTruthy(); // the status='new'-scoped delete never touched this row
    expect(stillThere!.status).toBe("tracked"); // user action preserved
  });

  it("a dismissed opportunity does not resurrect as a fresh 'new' row on a same-week re-run", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    const [kw] = await addKeywords(t.db, p.id, [{ keyword: "seo reporting software", locationCode: 2840, languageCode: "en" }]);
    await t.db.insert(rankSnapshots).values({ keywordId: kw.id, rankAbsolute: 8, rankGroup: 8, fetchStatus: "ok", ownUrls: [] });
    await t.db.insert(keywordMetrics).values({ keywordId: kw.id, searchVolume: 2000, difficulty: 25 });
    const asOf = new Date("2026-08-10T00:00:00Z");

    await weeklyOpportunitiesHandler()({ db: t.db, projectId: p.id, asOf });
    const firstRun = await t.db.select().from(opportunities);
    expect(firstRun.length).toBeGreaterThan(0);
    const target = firstRun[0];
    await setOpportunityStatus(t.db, target.id, "dismissed");

    await weeklyOpportunitiesHandler()({ db: t.db, projectId: p.id, asOf }); // re-run, same week, same signals

    const after = await t.db.select().from(opportunities);
    const matching = after.filter((r: any) => r.keyword === target.keyword && r.type === target.type);
    expect(matching.length).toBe(1); // NOT resurrected as a second "new" row for the same (keyword, type)
    expect(matching[0].id).toBe(target.id); // still the original row, not a fresh insert
    expect(matching[0].status).toBe("dismissed"); // user action preserved, not reset to "new"
  });

  it("threads the project's saved opportunityWeights into scoring, not DEFAULT_WEIGHTS", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });

    // Heavily favor winnability over volume — the opposite of DEFAULT_WEIGHTS'
    // balanced blend (volume 0.25 / winnability 0.25).
    const winnabilityHeavy = { volume: 0.05, winnability: 0.6, position: 0.1, trend: 0.05, relevance: 0.2 };
    await t.db.update(projects).set({ opportunityWeights: winnabilityHeavy }).where(eq(projects.id, p.id));

    // Quick-win: trivially easy (KD 1) but tiny volume, decent-not-great position.
    const [quickWin] = await addKeywords(t.db, p.id, [{ keyword: "email marketing quick win", locationCode: 2840, languageCode: "en" }]);
    await t.db.insert(rankSnapshots).values({ keywordId: quickWin.id, rankAbsolute: 10, rankGroup: 10, fetchStatus: "ok", ownUrls: [] });
    await t.db.insert(keywordMetrics).values({ keywordId: quickWin.id, searchVolume: 20, difficulty: 1 });

    // Big-bet: huge volume but much harder (KD 60), slightly better position.
    const [bigBet] = await addKeywords(t.db, p.id, [{ keyword: "email marketing big bet", locationCode: 2840, languageCode: "en" }]);
    await t.db.insert(rankSnapshots).values({ keywordId: bigBet.id, rankAbsolute: 6, rankGroup: 6, fetchStatus: "ok", ownUrls: [] });
    await t.db.insert(keywordMetrics).values({ keywordId: bigBet.id, searchVolume: 9800, difficulty: 60 });

    // Under DEFAULT_WEIGHTS the big-bet's volume+position edge would outrank the
    // quick-win (score ≈79 vs ≈76) — so a top-of-list quick-win below only proves
    // the job actually read and threaded this project's saved weights.
    const asOf = new Date("2026-08-10T00:00:00Z");
    await weeklyOpportunitiesHandler()({ db: t.db, projectId: p.id, asOf });

    const rows = await listOpportunities(t.db, p.id, mondayOf("2026-08-10"));
    expect(rows).toHaveLength(2);
    expect(rows[0].keyword).toBe("email marketing quick win"); // winnability-heavy weights promoted it to #1
    expect(rows[1].keyword).toBe("email marketing big bet");
  });
});

describe("upsertOpportunities transaction safety", () => {
  const weekOf = "2026-08-10";
  const base = {
    keywordId: null,
    volume: 100,
    difficulty: 10,
    currentPosition: 5,
    trend: null,
    scoreBreakdown: {},
    upsideEstimate: null,
  };

  it("rolls back the delete when the insert fails — the prior shortlist survives", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });

    // Seed one status='new' shortlist row via the real API.
    await upsertOpportunities(t.db, p.id, weekOf, [
      { ...base, keyword: "keep me", type: "gap", score: 42, why: "kept" } as any,
    ]);

    // A row whose NOT NULL `why` is null makes the INSERT throw *after* the
    // status='new' delete. Without the transaction the delete commits and the
    // week's shortlist is wiped; with it, the whole upsert rolls back.
    const bad = [{ ...base, keyword: "boom", type: "gap", score: 1, why: null } as any];
    await expect(upsertOpportunities(t.db, p.id, weekOf, bad)).rejects.toThrow();

    const rows = await t.db.select().from(opportunities);
    expect(rows.map((r: any) => r.keyword)).toEqual(["keep me"]);
  });
});
