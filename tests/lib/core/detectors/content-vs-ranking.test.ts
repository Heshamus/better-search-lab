import { describe, it, expect } from "vitest";
import { detectContentVsRanking } from "@/lib/core/detectors/content-vs-ranking";
import type { DetectorInput, PageSignal } from "@/lib/core/detectors/types";

const page = (o: Partial<PageSignal> = {}): PageSignal => ({
  url: "https://x.io/blog", gscClicks: 120, gscImpressions: 3000, gscPosition: 4,
  gaSessions: 110, gaEngagementRate: 0.18, gaConversions: 0, ...o,
});
const input = (pages: PageSignal[]): DetectorInput => ({ keywordSignals: [], gapSignals: [], pageSignals: pages, asOf: new Date(0) });

describe("detectContentVsRanking", () => {
  it("flags a page that ranks + earns clicks but whose visitors barely engage", () => {
    const out = detectContentVsRanking(input([page()]));
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("content_vs_ranking");
    expect(out[0].keywordId).toBeNull();
    expect(out[0].keyword).toBe("https://x.io/blog");
    expect(out[0].volume).toBe(120);
    expect(out[0].evidence).toMatchObject({ url: "https://x.io/blog", gaEngagementRate: 0.18 });
  });
  it("ignores pages with healthy engagement", () => {
    expect(detectContentVsRanking(input([page({ gaEngagementRate: 0.6 })]))).toHaveLength(0);
  });
  it("ignores pages with trivial traffic", () => {
    expect(detectContentVsRanking(input([page({ gscClicks: 3 })]))).toHaveLength(0);
  });
});
