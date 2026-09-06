import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { addKeywords, setKeywordTracked } from "@/lib/keywords";
import { rankSnapshots, keywordMetrics } from "@/db/schema";
import { listRankings, rankHistory, getAveragePositionHistory } from "@/lib/rankings";

let close: () => Promise<void>;
afterEach(() => close?.());

const d = (s: string) => new Date(s + "T00:00:00Z");

describe("listRankings", () => {
  // Brief's spec test, verbatim shape: latest ok snapshot + 7d delta + metrics
  // per tracked keyword, and a failed-only keyword stays honest (no fabricated rank).
  it("shapes latest rank + 7d delta + metrics per tracked keyword; failed stays honest", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    const [k1, k2] = await addKeywords(t.db, p.id, [
      { keyword: "seo reporting", locationCode: 2840, languageCode: "en" },
      { keyword: "rank tracker", locationCode: 2840, languageCode: "en" },
    ]);
    await t.db.insert(rankSnapshots).values([
      { keywordId: k1.id, capturedAt: d("2026-08-03"), rankAbsolute: 15, fetchStatus: "ok", serpFeatures: [] },
      { keywordId: k1.id, capturedAt: d("2026-08-10"), rankAbsolute: 8, fetchStatus: "ok", serpFeatures: ["featured_snippet"] },
      { keywordId: k2.id, capturedAt: d("2026-08-10"), rankAbsolute: null, fetchStatus: "failed", reason: "timeout", serpFeatures: [] },
    ]);
    await t.db.insert(keywordMetrics).values({ keywordId: k1.id, searchVolume: 1200, difficulty: 30 });
    const rows = await listRankings(t.db, p.id, d("2026-08-10"));
    const r1 = rows.find((r) => r.keywordId === k1.id)!;
    expect(r1.rankAbsolute).toBe(8); expect(r1.delta7).toBe(7); expect(r1.volume).toBe(1200);
    expect(r1.serpFeatures).toContain("featured_snippet");
    expect(r1.fetchStatus).toBe("ok");
    expect(r1.difficulty).toBe(30);
    const r2 = rows.find((r) => r.keywordId === k2.id)!;
    expect(r2.fetchStatus).toBe("failed"); expect(r2.rankAbsolute).toBeNull(); expect(r2.delta7).toBeNull();
    expect(r2.volume).toBeNull(); // no metrics row seeded for k2 — must not fabricate
    expect((await rankHistory(t.db, k1.id)).length).toBe(2);
  });

  it("computes delta7 and delta30 independently from a 3-point history", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    const [k1] = await addKeywords(t.db, p.id, [{ keyword: "x", locationCode: 2840, languageCode: "en" }]);
    await t.db.insert(rankSnapshots).values([
      { keywordId: k1.id, capturedAt: d("2026-07-11"), rankAbsolute: 20, fetchStatus: "ok" }, // 30d before asOf
      { keywordId: k1.id, capturedAt: d("2026-08-03"), rankAbsolute: 15, fetchStatus: "ok" }, // 7d before asOf
      { keywordId: k1.id, capturedAt: d("2026-08-10"), rankAbsolute: 8, fetchStatus: "ok" }, // asOf
    ]);
    const rows = await listRankings(t.db, p.id, d("2026-08-10"));
    expect(rows[0].delta7).toBe(7); // 15 - 8
    expect(rows[0].delta30).toBe(12); // 20 - 8
  });

  it("excludes untracked keywords and other projects' keywords", async () => {
    const t = await createTestDb(); close = t.close;
    const p1 = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    const p2 = await createProject(t.db, { name: "Other", domain: "other.com" });
    const [k1, k2] = await addKeywords(t.db, p1.id, [
      { keyword: "tracked", locationCode: 2840, languageCode: "en" },
      { keyword: "untracked", locationCode: 2840, languageCode: "en" },
    ]);
    await addKeywords(t.db, p2.id, [{ keyword: "other project kw", locationCode: 2840, languageCode: "en" }]);
    await setKeywordTracked(t.db, k2.id, false);
    const rows = await listRankings(t.db, p1.id, d("2026-08-10"));
    expect(rows.length).toBe(1);
    expect(rows[0].keywordId).toBe(k1.id);
  });

  it("reports a never-fetched tracked keyword honestly (no fabricated ok/rank)", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    await addKeywords(t.db, p.id, [{ keyword: "brand new", locationCode: 2840, languageCode: "en" }]);
    const rows = await listRankings(t.db, p.id, d("2026-08-10"));
    expect(rows.length).toBe(1);
    expect(rows[0].fetchStatus).toBe("unknown"); // never attempted — distinct from ok AND failed
    expect(rows[0].rankAbsolute).toBeNull();
    expect(rows[0].url).toBeNull();
    expect(rows[0].serpFeatures).toEqual([]);
    expect(rows[0].volume).toBeNull();
    expect(rows[0].delta7).toBeNull();
    expect(rows[0].delta30).toBeNull();
  });

  it("nulls rankAbsolute when the chronologically latest snapshot is failed, even if an older ok snapshot has a real rank", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    const [k1] = await addKeywords(t.db, p.id, [{ keyword: "x", locationCode: 2840, languageCode: "en" }]);
    await t.db.insert(rankSnapshots).values([
      { keywordId: k1.id, capturedAt: d("2026-08-01"), rankAbsolute: 5, fetchStatus: "ok", url: "https://example-site.com/x", serpFeatures: ["sitelinks"] },
      { keywordId: k1.id, capturedAt: d("2026-08-08"), rankAbsolute: null, fetchStatus: "failed", reason: "timeout" },
    ]);
    const rows = await listRankings(t.db, p.id, d("2026-08-08"));
    expect(rows[0].fetchStatus).toBe("failed");
    // Not 5 — today's true position is unknown, so no stale rank is shown as current.
    expect(rows[0].rankAbsolute).toBeNull();
    expect(rows[0].url).toBeNull();
    expect(rows[0].serpFeatures).toEqual([]);
    // Only one ok sample exists (2026-08-01) — deltaForKeyword's current and
    // previous cutoffs both resolve to that SAME stale snapshot, so the
    // honest answer is "no recent data" (null), never a fabricated 0.
    expect(rows[0].delta7).toBeNull();
    expect(rows[0].delta30).toBeNull();
  });
});

describe("rankHistory", () => {
  it("returns chronological snapshots including failed rows (gaps shown honestly)", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    const [k1] = await addKeywords(t.db, p.id, [{ keyword: "x", locationCode: 2840, languageCode: "en" }]);
    await t.db.insert(rankSnapshots).values([
      { keywordId: k1.id, capturedAt: d("2026-08-08"), rankAbsolute: 8, fetchStatus: "ok" },
      { keywordId: k1.id, capturedAt: d("2026-08-01"), rankAbsolute: 15, fetchStatus: "ok" },
      { keywordId: k1.id, capturedAt: d("2026-08-15"), rankAbsolute: null, fetchStatus: "failed" },
    ]);
    const hist = await rankHistory(t.db, k1.id);
    expect(hist.length).toBe(3);
    expect(hist.map((h) => h.capturedAt.toISOString().slice(0, 10))).toEqual(["2026-08-01", "2026-08-08", "2026-08-15"]);
    expect(hist[0].rankAbsolute).toBe(15);
    expect(hist[2].fetchStatus).toBe("failed");
    expect(hist[2].rankAbsolute).toBeNull();
  });

  it("returns an empty array for a keyword with no snapshots", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    const [k1] = await addKeywords(t.db, p.id, [{ keyword: "x", locationCode: 2840, languageCode: "en" }]);
    expect(await rankHistory(t.db, k1.id)).toEqual([]);
  });
});

describe("getAveragePositionHistory", () => {
  it("averages ok/non-null rankAbsolute per day across tracked keywords, excluding failed snapshots", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    const [k1, k2] = await addKeywords(t.db, p.id, [
      { keyword: "seo reporting", locationCode: 2840, languageCode: "en" },
      { keyword: "rank tracker", locationCode: 2840, languageCode: "en" },
    ]);
    await t.db.insert(rankSnapshots).values([
      // Day 1: k1=10, k2=20, both ok → mean 15
      { keywordId: k1.id, capturedAt: d("2026-08-01"), rankAbsolute: 10, fetchStatus: "ok" },
      { keywordId: k2.id, capturedAt: d("2026-08-01"), rankAbsolute: 20, fetchStatus: "ok" },
      // Day 2: k1=8 ok; k2 failed (null rank) — must be EXCLUDED, so mean is 8, not (8+0)/2
      { keywordId: k1.id, capturedAt: d("2026-08-08"), rankAbsolute: 8, fetchStatus: "ok" },
      { keywordId: k2.id, capturedAt: d("2026-08-08"), rankAbsolute: null, fetchStatus: "failed", reason: "timeout" },
    ]);
    const hist = await getAveragePositionHistory(t.db, p.id);
    expect(hist.points).toEqual([15, 8]);
    expect(hist.labels).toEqual(["2026-08-01", "2026-08-08"]);
  });

  it("returns empty points/labels when the project has no tracked keywords", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    expect(await getAveragePositionHistory(t.db, p.id)).toEqual({ points: [], labels: [] });
  });

  it("limit keeps the most-recent N days (not the oldest N), still ascending", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    const [k1] = await addKeywords(t.db, p.id, [{ keyword: "x", locationCode: 2840, languageCode: "en" }]);
    await t.db.insert(rankSnapshots).values([
      { keywordId: k1.id, capturedAt: d("2026-07-01"), rankAbsolute: 30, fetchStatus: "ok" },
      { keywordId: k1.id, capturedAt: d("2026-07-15"), rankAbsolute: 20, fetchStatus: "ok" },
      { keywordId: k1.id, capturedAt: d("2026-08-01"), rankAbsolute: 10, fetchStatus: "ok" },
    ]);
    // limit=2 must keep the 2 MOST RECENT days (07-15, 08-01) — not the 2
    // oldest (07-01, 07-15) — else the trend would freeze once history grows
    // past `limit` (the bug fixed for backlinks history in 3abd99c).
    const hist = await getAveragePositionHistory(t.db, p.id, 2);
    expect(hist.points).toEqual([20, 10]);
    expect(hist.labels).toEqual(["2026-07-15", "2026-08-01"]);
  });
});
