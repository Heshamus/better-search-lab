import type { Candidate, DetectorInput } from "./types";

// Rounded organic CTR-by-position curve (industry aggregate). Position > 10 → ~0.
const CTR_CURVE = [0.28, 0.15, 0.1, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02, 0.018];

/** Expected organic CTR for a 1-based SERP position (clamped to the curve). */
export function expectedCtr(position: number): number {
  if (position < 1) return CTR_CURVE[0];
  const i = Math.min(Math.floor(position) - 1, CTR_CURVE.length - 1);
  return CTR_CURVE[i];
}

const MIN_IMPRESSIONS = 100; // ignore noise
const MAX_POSITION = 10; // only queries already ranking well
const GAP_RATIO = 0.6; // real CTR below 60% of expected = underperforming title/meta

/**
 * A query that already ranks well but whose REAL click-through (from Search
 * Console) trails the expected curve for its position — the title/meta is
 * underselling, and a rewrite wins clicks you're already earning impressions
 * for. Impossible to detect without first-party GSC data.
 */
export function detectCtrGap(input: DetectorInput): Candidate[] {
  const out: Candidate[] = [];
  for (const s of input.keywordSignals) {
    if (s.gscPosition == null || s.gscCtr == null || s.gscImpressions == null) continue;
    if (s.gscPosition > MAX_POSITION || s.gscImpressions < MIN_IMPRESSIONS) continue;
    const exp = expectedCtr(s.gscPosition);
    if (s.gscCtr >= exp * GAP_RATIO) continue;
    out.push({
      type: "ctr_gap",
      keyword: s.keyword,
      keywordId: s.keywordId,
      volume: s.gscImpressions, // demand axis = real impressions
      difficulty: s.difficulty,
      currentPosition: Math.round(s.gscPosition),
      trend: null,
      evidence: { position: Math.round(s.gscPosition), ctr: s.gscCtr, expectedCtr: exp, impressions: s.gscImpressions },
    });
  }
  return out;
}
