import { describe, it, expect } from "vitest";
import { scoreOpportunity, DEFAULT_WEIGHTS } from "@/lib/core/scoring";
import type { Candidate } from "@/lib/core/detectors/types";

const cand = (o: Partial<Candidate>): Candidate => ({ type: "striking_distance", keyword: "k", keywordId: "k", volume: 1000, difficulty: 30, currentPosition: 8, trend: 3, evidence: {}, ...o });

describe("scoreOpportunity", () => {
  it("breakdown sums to the score (transparency)", () => {
    const s = scoreOpportunity(cand({}), 0.8);
    const sum = Object.values(s.breakdown).reduce((a, b) => a + b, 0) * 100;
    expect(s.score).toBeCloseTo(sum, 5);
    expect(s.score).toBeGreaterThan(0);
    expect(s.score).toBeLessThanOrEqual(100);
  });
  it("higher volume scores higher, all else equal", () => {
    expect(scoreOpportunity(cand({ volume: 5000 }), 0.8).score)
      .toBeGreaterThan(scoreOpportunity(cand({ volume: 50 }), 0.8).score);
  });
  it("re-weighting toward winnability reorders quick-wins vs big-bets", () => {
    const bigBet = cand({ volume: 8000, difficulty: 80 });
    const quickWin = cand({ volume: 400, difficulty: 10 });
    const volHeavy = { ...DEFAULT_WEIGHTS, volume: 0.6, winnability: 0.05, position: 0.1, trend: 0.05, relevance: 0.2 };
    const winHeavy = { ...DEFAULT_WEIGHTS, volume: 0.05, winnability: 0.6, position: 0.1, trend: 0.05, relevance: 0.2 };
    expect(scoreOpportunity(bigBet, 0.8, volHeavy).score).toBeGreaterThan(scoreOpportunity(quickWin, 0.8, volHeavy).score);
    expect(scoreOpportunity(quickWin, 0.8, winHeavy).score).toBeGreaterThan(scoreOpportunity(bigBet, 0.8, winHeavy).score);
  });
});
