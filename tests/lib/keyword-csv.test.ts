import { describe, it, expect } from "vitest";
import { buildKeywordCsv } from "@/lib/keyword-csv";
import type { KeywordOverviewRow } from "@/lib/dataforseo/labs";

const row = (o: Partial<KeywordOverviewRow>): KeywordOverviewRow => ({
  keyword: "kw", searchVolume: null, cpc: null, competition: null, difficulty: null, monthly: [], trendPct: null, ...o,
});

describe("buildKeywordCsv", () => {
  it("emits header with union of month columns (sorted) and aligns rows", () => {
    const csv = buildKeywordCsv([
      row({ keyword: "a", searchVolume: 100, difficulty: 40, cpc: 2, competition: 0.5, trendPct: 12,
            monthly: [{ year: 2026, month: 7, volume: 90 }, { year: 2026, month: 8, volume: 100 }] }),
      row({ keyword: "b", searchVolume: 50,
            monthly: [{ year: 2026, month: 6, volume: 40 }] }),
    ]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Keyword,Volume,Difficulty,CPC,Competition,Trend % (12mo),2026-06,2026-07,2026-08");
    // row a has no 2026-06 → empty leading month cell; b has only 2026-06
    expect(lines[1]).toBe("a,100,40,2,0.5,12,,90,100");
    expect(lines[2]).toBe("b,50,,,,,40,,");
  });

  it("quotes and escapes fields containing commas or quotes", () => {
    const csv = buildKeywordCsv([row({ keyword: 'best "crm", software', searchVolume: 10 })]);
    expect(csv.split("\r\n")[1]).toBe('"best ""crm"", software",10,,,,');
  });
});
