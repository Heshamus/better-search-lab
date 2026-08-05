import { describe, it, expect } from "vitest";
import fixture from "@/lib/dataforseo/fixtures/keyword-overview-bulk-live.json";
import { keywordOverviewBulk } from "@/lib/dataforseo/labs";

const clientFrom = (resp: unknown) => ({ post: async () => resp }) as any;

describe("keywordOverviewBulk", () => {
  it("maps the real fixture: trims history to the most recent 12 months (ascending) and reads the yearly trend", async () => {
    // The probe's trim kept only tasks[0].status_code, not the top-level envelope
    // status_code that a real DataForSEO response always carries (see the sibling
    // keyword-overview-live.json fixture) and that assertTasksOk requires alongside
    // the task-level one. Restore it here, in the mock only — the fixture file on
    // disk is untouched; this does not alter any keyword data.
    const client = clientFrom({ status_code: 20000, ...fixture });
    const { rows, rowsBilled } = await keywordOverviewBulk(client, {
      keywords: ["notion alternative", "project management software"],
      locationCode: 2840, languageCode: "en",
    });
    expect(rowsBilled).toBe(2);
    expect(rows).toHaveLength(2);

    const pms = rows.find((r) => r.keyword === "project management software")!;
    expect(pms.searchVolume).toBe(135000);
    expect(pms.difficulty).toBe(51);
    expect(pms.trendPct).toBe(172);              // DataForSEO search_volume_trend.yearly
    expect(pms.monthly).toHaveLength(12);        // trimmed from 15 real months
    expect(pms.monthly[11]).toEqual({ year: 2026, month: 6, volume: 246000 }); // newest last
    for (let k = 1; k < pms.monthly.length; k++) {
      const a = pms.monthly[k - 1], b = pms.monthly[k];
      expect(a.year * 12 + a.month).toBeLessThan(b.year * 12 + b.month); // strictly ascending
    }

    const na = rows.find((r) => r.keyword === "notion alternative")!;
    expect(na.trendPct).toBe(0);
  });

  it("falls back to a computed 12-month delta when search_volume_trend is absent, guarding divide-by-zero", async () => {
    const mk = (months: any[]) => ({
      status_code: 20000,
      tasks: [{ status_code: 20000, result: [{ items: [{
        keyword: "k",
        keyword_info: { search_volume: 100, cpc: 1, competition: 0.2, monthly_searches: months },
        keyword_properties: { keyword_difficulty: 10 },
      }] }] }],
    });
    // rising 100 -> 150, no trend field -> computed +50
    const rising = await keywordOverviewBulk(
      clientFrom(mk([{ year: 2025, month: 8, search_volume: 100 }, { year: 2026, month: 8, search_volume: 150 }])),
      { keywords: ["k"], locationCode: 2840, languageCode: "en" },
    );
    expect(rising.rows[0].trendPct).toBe(50);
    // earliest 0 -> null (no divide by zero)
    const zero = await keywordOverviewBulk(
      clientFrom(mk([{ year: 2025, month: 8, search_volume: 0 }, { year: 2026, month: 8, search_volume: 500 }])),
      { keywords: ["k"], locationCode: 2840, languageCode: "en" },
    );
    expect(zero.rows[0].trendPct).toBeNull();
  });

  it("left-joins onto the requested list: a keyword absent from the response still yields a null row, order preserved", async () => {
    const client = clientFrom({
      status_code: 20000,
      tasks: [{ status_code: 20000, result: [{ items: [{
        keyword: "present", keyword_info: { search_volume: 200, monthly_searches: [] }, keyword_properties: {},
      }] }] }],
    });
    const { rows } = await keywordOverviewBulk(client, { keywords: ["present", "missing"], locationCode: 2840, languageCode: "en" });
    expect(rows.map((r) => r.keyword)).toEqual(["present", "missing"]);
    expect(rows[1]).toMatchObject({ keyword: "missing", searchVolume: null, monthly: [], trendPct: null });
  });
});
