import type { DetectorInput, Candidate } from "./types";
import { latestByKeyword, deltaForKeyword } from "@/lib/core/history";

const MIN_GAIN = 2;

/**
 * A keyword gaining ≥ MIN_GAIN positions WoW. Position-gain only in v1;
 * volume-trend momentum is deferred (no metrics-history table yet).
 */
export function momentum(input: DetectorInput): Candidate[] {
  const out: Candidate[] = [];
  for (const ks of input.keywordSignals) {
    const trend = deltaForKeyword(ks.snapshots, input.asOf, 7);
    if (trend == null || trend < MIN_GAIN) continue;
    const latest = latestByKeyword(ks.snapshots).get(ks.keywordId);
    out.push({
      type: "momentum",
      keyword: ks.keyword,
      keywordId: ks.keywordId,
      volume: ks.volume,
      difficulty: ks.difficulty,
      currentPosition: latest?.rankAbsolute ?? null,
      trend,
      evidence: {},
    });
  }
  return out;
}
