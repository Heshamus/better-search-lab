import { describe, it, expect } from "vitest";
import { strikingDistance } from "@/lib/core/detectors/striking-distance";
import { decay } from "@/lib/core/detectors/decay";
import { momentum } from "@/lib/core/detectors/momentum";
import type { DetectorInput, KeywordSignal } from "@/lib/core/detectors/types";

const d = (s: string) => new Date(s + "T00:00:00Z");
// serpFeatures/ownUrls are part of the real DetectorSnap shape (added after
// this brief was sliced, for the gap/serp-feature/cannibalization detectors
// in Task 5) but unused by the position detectors under test here.
const snap = (date: string, rank: number | null) => ({
  keywordId: "k",
  capturedAt: d(date),
  rankAbsolute: rank,
  fetchStatus: "ok",
  serpFeatures: [],
  ownedFeatures: [],
  ownUrls: [],
});
const ks = (over: Partial<KeywordSignal>): KeywordSignal => ({
  keywordId: "k", keyword: "seo reporting", tags: [], snapshots: [], ownUrls: [], volume: 1200, difficulty: 30,
  gscImpressions: null, gscClicks: null, gscCtr: null, gscPosition: null, ...over,
});
const input = (signals: KeywordSignal[], asOf = d("2026-08-10")): DetectorInput => ({ keywordSignals: signals, gapSignals: [], pageSignals: [], asOf });

describe("strikingDistance", () => {
  it("flags a keyword sitting at #5–20", () => {
    const out = strikingDistance(input([ks({ snapshots: [snap("2026-08-10", 11)] })]));
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("striking_distance");
    expect(out[0].currentPosition).toBe(11);
  });
  it("ignores page-1 top-4 and beyond-20", () => {
    expect(strikingDistance(input([ks({ snapshots: [snap("2026-08-10", 3)] })]))).toHaveLength(0);
    expect(strikingDistance(input([ks({ snapshots: [snap("2026-08-10", 40)] })]))).toHaveLength(0);
  });
  it("never fabricates from a failed/empty history", () => {
    expect(strikingDistance(input([ks({ snapshots: [] })]))).toHaveLength(0);
  });
});

describe("decay", () => {
  it("flags a page-1 keyword that lost positions WoW", () => {
    const out = decay(input([ks({ snapshots: [snap("2026-08-03", 4), snap("2026-08-10", 9)] })]));
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("decay");
    expect(out[0].trend).toBe(-5); // previous 4 - current 9
  });
  it("does not flag improvement or a never-page-1 keyword", () => {
    expect(decay(input([ks({ snapshots: [snap("2026-08-03", 4), snap("2026-08-10", 2)] })]))).toHaveLength(0);
    expect(decay(input([ks({ snapshots: [snap("2026-08-03", 30), snap("2026-08-10", 40)] })]))).toHaveLength(0);
  });
});

describe("momentum", () => {
  it("flags a keyword gaining positions WoW", () => {
    const out = momentum(input([ks({ snapshots: [snap("2026-08-03", 18), snap("2026-08-10", 9)] })]));
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("momentum");
    expect(out[0].trend).toBe(9);
  });
  it("does not flag a flat or declining keyword", () => {
    expect(momentum(input([ks({ snapshots: [snap("2026-08-03", 9), snap("2026-08-10", 9)] })]))).toHaveLength(0);
  });
});

describe("strikingDistance — first-party GSC", () => {
  it("uses real impressions/position when the query has GSC data (page 2)", () => {
    const out = strikingDistance(input([ks({ gscPosition: 14, gscImpressions: 2300, volume: 50 })]));
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("striking_distance");
    expect(out[0].currentPosition).toBe(14);
    expect(out[0].volume).toBe(2300); // real impressions, not the 50 estimate
    expect(out[0].evidence).toMatchObject({ source: "gsc" });
  });
  it("falls back to the snapshot path (as estimate) for page-1 GSC positions and thin impressions", () => {
    const out = strikingDistance(input([ks({ gscPosition: 8, gscImpressions: 5000, snapshots: [snap("2026-08-10", 8)] })]));
    expect(out).toHaveLength(1);
    expect(out[0].evidence).toMatchObject({ source: "estimate" });
    expect(strikingDistance(input([ks({ gscPosition: 14, gscImpressions: 20 })]))).toHaveLength(0);
  });
  it("tags the snapshot path as estimate when there is no GSC data", () => {
    const out = strikingDistance(input([ks({ snapshots: [snap("2026-08-10", 12)] })]));
    expect(out[0].evidence).toMatchObject({ source: "estimate" });
  });
});
