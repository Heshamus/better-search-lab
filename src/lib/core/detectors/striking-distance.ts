import type { DetectorInput, Candidate } from "./types";
import { latestByKeyword, deltaForKeyword } from "@/lib/core/history";

const STRIKING_MIN = 5;
const STRIKING_MAX = 20;

/** Keywords sitting at #5–20: one page of movement from the top of page 1. */
export function strikingDistance(input: DetectorInput): Candidate[] {
  const out: Candidate[] = [];
  for (const ks of input.keywordSignals) {
    const latest = latestByKeyword(ks.snapshots).get(ks.keywordId);
    const pos = latest?.rankAbsolute ?? null;
    if (pos == null || pos < STRIKING_MIN || pos > STRIKING_MAX) continue;
    out.push({
      type: "striking_distance",
      keyword: ks.keyword,
      keywordId: ks.keywordId,
      volume: ks.volume,
      difficulty: ks.difficulty,
      currentPosition: pos,
      trend: deltaForKeyword(ks.snapshots, input.asOf, 7),
      evidence: {},
    });
  }
  return out;
}
