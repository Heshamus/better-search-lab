import { describe, it, expect } from "vitest";
import { parseKeywordList } from "@/lib/keyword-list";

describe("parseKeywordList", () => {
  it("splits on newlines and commas, trims, lowercases, dedupes preserving order", () => {
    const { keywords, dropped } = parseKeywordList("  Alpha\nbeta, ALPHA ,gamma\n\n");
    expect(keywords).toEqual(["alpha", "beta", "gamma"]);
    expect(dropped).toBe(0);
  });

  it("caps at 100 and reports only the cap overflow as dropped", () => {
    const raw = Array.from({ length: 105 }, (_, i) => `kw${i}`).join("\n");
    const { keywords, dropped } = parseKeywordList(raw);
    expect(keywords).toHaveLength(100);
    expect(dropped).toBe(5);
  });

  it("does not count dedupe/empties toward dropped", () => {
    const { keywords, dropped } = parseKeywordList("a\na\n\n , b");
    expect(keywords).toEqual(["a", "b"]);
    expect(dropped).toBe(0);
  });

  it("returns empty for whitespace-only input", () => {
    expect(parseKeywordList("   \n , \n")).toEqual({ keywords: [], dropped: 0 });
  });
});
