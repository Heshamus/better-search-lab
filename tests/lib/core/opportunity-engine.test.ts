import { describe, it, expect } from "vitest";
import { assembleOpportunities } from "@/lib/core/opportunity-engine";
import type { DetectorInput, KeywordSignal } from "@/lib/core/detectors/types";

const d = (s: string) => new Date(s + "T00:00:00Z");
const snap = (rank: number, features: string[] = [], ownUrls: string[] = []) => ({ keywordId: "k", capturedAt: d("2026-08-10"), rankAbsolute: rank, fetchStatus: "ok", serpFeatures: features, ownUrls });
const ks = (o: Partial<KeywordSignal>): KeywordSignal => ({ keywordId: "k1", keyword: "seo reporting software", tags: ["seo"], snapshots: [snap(8)], ownUrls: [], volume: 2000, difficulty: 25, ...o });

describe("assembleOpportunities", () => {
  it("produces a relevance-filtered, score-sorted shortlist with transparent why/breakdown", () => {
    const input: DetectorInput = {
      asOf: d("2026-08-10"),
      keywordSignals: [ks({})],
      gapSignals: [
        { keyword: "automated seo reporting", volume: 3000, difficulty: 30, competitorCount: 3 }, // on-niche gap
        { keyword: "best plumbing near me", volume: 90000, difficulty: 20, competitorCount: 4 },   // noise — must be filtered
      ],
    };
    const out = assembleOpportunities(input, { topN: 10 });
    const keywords = out.map((o) => o.keyword);
    expect(keywords).toContain("automated seo reporting");
    expect(keywords).not.toContain("best plumbing near me"); // relevance gate removed the high-volume noise
    // sorted desc
    for (let i = 1; i < out.length; i++) expect(out[i - 1].score).toBeGreaterThanOrEqual(out[i].score);
    // transparency present
    expect(out[0].why.length).toBeGreaterThan(0);
    expect(Object.keys(out[0].scoreBreakdown).length).toBeGreaterThan(0);
  });

  it("respects topN", () => {
    // NOTE: snap()'s keywordId is hardcoded "k" (brief fixture, kept verbatim
    // above); per-signal snapshots must carry a matching keywordId or
    // latestByKeyword(...).get(ks.keywordId) never resolves and every
    // detector yields zero candidates regardless of assembler correctness.
    // See task-8-report.md for detail.
    const many: KeywordSignal[] = Array.from({ length: 30 }, (_, i) => {
      const keywordId = `k${i}`;
      return ks({ keywordId, keyword: `seo metric ${i}`, snapshots: [{ ...snap(7), keywordId }] });
    });
    const out = assembleOpportunities({ asOf: d("2026-08-10"), keywordSignals: many, gapSignals: [] }, { topN: 5 });
    expect(out).toHaveLength(5);
  });
});
