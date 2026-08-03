import { describe, it, expect } from "vitest";
import { gap } from "@/lib/core/detectors/gap";
import { serpFeature } from "@/lib/core/detectors/serp-feature";
import { cannibalization } from "@/lib/core/detectors/cannibalization";
import { runDetectors } from "@/lib/core/detectors";
import type { DetectorInput, KeywordSignal, GapSignal } from "@/lib/core/detectors/types";

const d = (s: string) => new Date(s + "T00:00:00Z");
const base = (over: Partial<DetectorInput>): DetectorInput => ({ keywordSignals: [], gapSignals: [], asOf: d("2026-08-10"), ...over });
const ks = (o: Partial<KeywordSignal>): KeywordSignal => ({ keywordId: "k", keyword: "seo reporting", tags: [], snapshots: [], ownUrls: [], volume: 1000, difficulty: 30, ...o });
const snap = (rank: number | null, features: string[] = [], ownUrls: string[] = []) => ({ keywordId: "k", capturedAt: d("2026-08-10"), rankAbsolute: rank, fetchStatus: "ok", serpFeatures: features, ownUrls });

describe("gap", () => {
  it("flags winnable keywords a competitor ranks for", () => {
    const g: GapSignal = { keyword: "rank tracker", volume: 800, difficulty: 40, competitorCount: 2 };
    const out = gap(base({ gapSignals: [g] }));
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("gap");
    expect(out[0].keywordId).toBeNull();
    expect(out[0].evidence.competitorCount).toBe(2);
  });
  it("skips unwinnable (high-KD) gaps regardless of competitor count", () => {
    expect(gap(base({ gapSignals: [{ keyword: "b", volume: 1, difficulty: 95, competitorCount: 3 }] }))).toHaveLength(0);
  });
  it("skips gaps no competitor ranks for", () => {
    expect(gap(base({ gapSignals: [{ keyword: "a", volume: 1, difficulty: 10, competitorCount: 0 }] }))).toHaveLength(0);
  });
});

describe("serpFeature", () => {
  it("flags a page-1 keyword with a capturable feature present", () => {
    const out = serpFeature(base({ keywordSignals: [ks({ snapshots: [snap(3, ["featured_snippet"])] })] }));
    expect(out).toHaveLength(1);
    expect(out[0].evidence.feature).toBe("featured_snippet");
  });
  it("ignores when we're not page-1", () => {
    expect(serpFeature(base({ keywordSignals: [ks({ snapshots: [snap(15, ["featured_snippet"])] })] }))).toHaveLength(0);
  });
});

describe("cannibalization", () => {
  it("flags ≥2 of our URLs for one keyword", () => {
    const out = cannibalization(base({ keywordSignals: [ks({ snapshots: [snap(4, [], ["u1", "u2"])] })] }));
    expect(out).toHaveLength(1);
    expect((out[0].evidence.urls as string[])).toHaveLength(2);
  });
  it("ignores a single-URL keyword", () => {
    expect(cannibalization(base({ keywordSignals: [ks({ snapshots: [snap(4, [], ["u1"])] })] }))).toHaveLength(0);
  });
});

describe("runDetectors", () => {
  it("aggregates candidates from all detector families", () => {
    // rank 10 (not the brief's literal 11): must satisfy serpFeature's
    // page-1 gate (rankAbsolute <= PAGE1(10)) AND striking-distance's
    // [5,20] window simultaneously so all four families fire from one
    // snapshot. 11 fails the page-1 gate (11 > 10), which would make
    // serp_feature never appear no matter the implementation — see report.
    const out = runDetectors(base({
      keywordSignals: [ks({ snapshots: [snap(10, ["ai_overview"], ["u1", "u2"])] })],
      gapSignals: [{ keyword: "rank tracker", volume: 800, difficulty: 40, competitorCount: 2 }],
    }));
    const types = new Set(out.map((c) => c.type));
    expect(types.has("striking_distance")).toBe(true);
    expect(types.has("serp_feature")).toBe(true);
    expect(types.has("cannibalization")).toBe(true);
    expect(types.has("gap")).toBe(true);
  });
});
