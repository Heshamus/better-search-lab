import type { DetectorInput, Candidate } from "./types";

const MIN_COMPETITORS = 2;
const MAX_KD = 60;

/**
 * A keyword ≥ MIN_COMPETITORS competitors rank for that we don't track at
 * all, and winnable (KD ≤ MAX_KD, or unscored). Not a tracked keyword, so
 * keywordId/currentPosition/trend are null — there's no rank history yet.
 */
export function gap(input: DetectorInput): Candidate[] {
  const out: Candidate[] = [];
  for (const g of input.gapSignals) {
    if (g.competitorCount < MIN_COMPETITORS) continue;
    const winnable = g.difficulty == null || g.difficulty <= MAX_KD;
    if (!winnable) continue;
    out.push({
      type: "gap",
      keyword: g.keyword,
      keywordId: null,
      volume: g.volume,
      difficulty: g.difficulty,
      currentPosition: null,
      trend: null,
      evidence: { competitorCount: g.competitorCount },
    });
  }
  return out;
}
