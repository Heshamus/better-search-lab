import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { addKeywords } from "@/lib/keywords";
import { rankSnapshots, keywordMetrics, apiUsage } from "@/db/schema";
import { computeHealthMetrics } from "@/lib/dashboard-metrics";

let close: () => Promise<void>;
afterEach(() => close?.());

const d = (s: string) => new Date(s + "T00:00:00Z");

describe("computeHealthMetrics", () => {
  it("aggregates visibility/traffic/position/keywords/spend from seeded ok snapshots + metrics + usage", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });
    const [k1, k2] = await addKeywords(t.db, p.id, [
      { keyword: "seo reporting", locationCode: 2840, languageCode: "en" },
      { keyword: "rank tracker", locationCode: 2840, languageCode: "en" },
    ]);
    await t.db.insert(rankSnapshots).values([
      { keywordId: k1.id, capturedAt: d("2026-08-01"), rankAbsolute: 5, fetchStatus: "ok" },
      { keywordId: k2.id, capturedAt: d("2026-08-01"), rankAbsolute: 15, fetchStatus: "ok" },
    ]);
    await t.db.insert(keywordMetrics).values([
      { keywordId: k1.id, searchVolume: 1000, difficulty: 20 },
      { keywordId: k2.id, searchVolume: 500, difficulty: 40 },
    ]);
    await t.db.insert(apiUsage).values({
      occurredAt: d("2026-08-02"), projectId: p.id, endpoint: "serp", rows: 2, estCost: "1.25",
    });

    const m = await computeHealthMetrics(t.db, p.id, d("2026-08-03"));

    // All 5 display strings present and non-"—" — every field has real seeded data behind it.
    expect(m.visibility).not.toBe("—");
    expect(m.estTraffic).not.toBe("—");
    expect(m.avgPosition).not.toBe("—");
    expect(m.avgPosition).toMatch(/^\d+(\.\d+)?$/); // numeric-ish, no stray label text
    expect(m.keywordsTracked).toBe("2");
    expect(m.spend).not.toBe("—");
    expect(m.spend).toMatch(/^\$\d/); // formatted currency

    // avgPosition is the mean of the two ok ranks (5, 15) = 10.0
    expect(m.avgPosition).toBe("10.0");
  });

  it("renders honest '—' placeholders for visibility/traffic/position when no ok-ranked snapshot exists yet", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });
    await addKeywords(t.db, p.id, [{ keyword: "brand new", locationCode: 2840, languageCode: "en" }]);

    const m = await computeHealthMetrics(t.db, p.id, d("2026-08-03"));

    expect(m.visibility).toBe("—");
    expect(m.avgPosition).toBe("—");
    expect(m.estTraffic).toBe("—");
    // A count of 0 tracked-with-data is still an honest, known value — never "—".
    expect(m.keywordsTracked).toBe("1");
    // No usage rows at all this month is a known $0, not "unavailable".
    expect(m.spend).toBe("$0.00");
  });

  it("ignores a failed-only snapshot (no fabricated rank) and stays honest", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });
    const [k1] = await addKeywords(t.db, p.id, [{ keyword: "x", locationCode: 2840, languageCode: "en" }]);
    await t.db.insert(rankSnapshots).values([
      { keywordId: k1.id, capturedAt: d("2026-08-01"), rankAbsolute: null, fetchStatus: "failed", reason: "timeout" },
    ]);

    const m = await computeHealthMetrics(t.db, p.id, d("2026-08-03"));
    expect(m.visibility).toBe("—");
    expect(m.avgPosition).toBe("—");
    expect(m.estTraffic).toBe("—");
    expect(m.keywordsTracked).toBe("1");
  });

  it("scopes spend to the asOf calendar month only, excluding a prior month's usage row", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });
    await t.db.insert(apiUsage).values([
      { occurredAt: d("2026-07-15"), projectId: p.id, endpoint: "serp", rows: 1, estCost: "5.00" }, // last month — excluded
      { occurredAt: d("2026-08-02"), projectId: p.id, endpoint: "serp", rows: 1, estCost: "2.00" }, // this month — included
    ]);

    const m = await computeHealthMetrics(t.db, p.id, d("2026-08-10"));
    expect(m.spend).toBe("$2.00");
  });
});
