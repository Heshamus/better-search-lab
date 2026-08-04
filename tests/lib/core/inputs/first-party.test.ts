import { describe, it, expect } from "vitest";
import { normQuery, joinGscGa } from "@/lib/core/inputs/first-party";

describe("normQuery", () => {
  it("lowercases + collapses whitespace for matching keyword↔query", () => {
    expect(normQuery("  Best  SEO Tool ")).toBe("best seo tool");
  });
});

describe("joinGscGa", () => {
  it("joins GSC top pages to GA landing pages by normalized path", () => {
    const gscPages = [{ key: "https://x.io/blog", clicks: 10, impressions: 200, ctr: 0.05, position: 8 }];
    const gaByPath = new Map([["/blog", { sessions: 50, engagementRate: 0.4, conversions: 2 }]]);
    const rows = joinGscGa(gscPages, gaByPath);
    expect(rows[0]).toEqual({
      url: "https://x.io/blog", gscClicks: 10, gscImpressions: 200, gscPosition: 8,
      gaSessions: 50, gaEngagementRate: 0.4, gaConversions: 2,
    });
  });

  it("defaults GA fields to 0 when a page has no GA match", () => {
    const rows = joinGscGa([{ key: "https://x.io/orphan", clicks: 3, impressions: 40, ctr: 0.07, position: 12 }], new Map());
    expect(rows[0]).toMatchObject({ gaSessions: 0, gaEngagementRate: 0, gaConversions: 0 });
  });
});
