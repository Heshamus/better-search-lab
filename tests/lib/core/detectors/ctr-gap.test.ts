import { describe, it, expect } from "vitest";
import { detectCtrGap, expectedCtr } from "@/lib/core/detectors/ctr-gap";
import type { DetectorInput, KeywordSignal } from "@/lib/core/detectors/types";

const sig = (o: Partial<KeywordSignal> = {}): KeywordSignal => ({
  keywordId: "k1", keyword: "seo tool", tags: [], snapshots: [], ownUrls: [],
  volume: 100, difficulty: 30,
  gscImpressions: 4000, gscClicks: 40, gscCtr: 0.01, gscPosition: 3, ...o,
});
const input = (signals: KeywordSignal[]): DetectorInput => ({ keywordSignals: signals, gapSignals: [], pageSignals: [], asOf: new Date(0) });

describe("expectedCtr", () => {
  it("returns a higher expected CTR for better positions", () => {
    expect(expectedCtr(1)).toBeGreaterThan(expectedCtr(5));
  });
});

describe("detectCtrGap", () => {
  it("flags a top-position query whose real CTR is well below the curve", () => {
    const out = detectCtrGap(input([sig()]));
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("ctr_gap");
    expect(out[0].evidence).toMatchObject({ position: 3, impressions: 4000 });
    expect(out[0].volume).toBe(4000); // demand axis = real impressions
  });
  it("ignores queries already at/above expected CTR", () => {
    expect(detectCtrGap(input([sig({ gscCtr: 0.5 })]))).toHaveLength(0);
  });
  it("ignores low-impression noise and missing GSC data", () => {
    expect(detectCtrGap(input([sig({ gscImpressions: 20 })]))).toHaveLength(0);
    expect(detectCtrGap(input([sig({ gscPosition: null, gscCtr: null })]))).toHaveLength(0);
  });
  it("ignores queries not ranking in the top 10", () => {
    expect(detectCtrGap(input([sig({ gscPosition: 15 })]))).toHaveLength(0);
  });
});
