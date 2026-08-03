import type { DetectorInput, Candidate } from "./types";
import { latestByKeyword, deltaForKeyword } from "@/lib/core/history";

const PAGE1 = 10;
const MIN_DROP = 2;

/** A keyword that was on page 1 and has since lost ≥ MIN_DROP positions WoW. */
export function decay(input: DetectorInput): Candidate[] {
  const out: Candidate[] = [];
  for (const ks of input.keywordSignals) {
    const wasPage1 = ks.snapshots.some(
      (s) => s.fetchStatus === "ok" && s.rankAbsolute != null && s.rankAbsolute <= PAGE1,
    );
    if (!wasPage1) continue;
    const trend = deltaForKeyword(ks.snapshots, input.asOf, 7);
    if (trend == null || trend > -MIN_DROP) continue;
    const latest = latestByKeyword(ks.snapshots).get(ks.keywordId);
    out.push({
      type: "decay",
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
