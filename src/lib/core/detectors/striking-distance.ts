import type { DetectorInput, Candidate } from "./types";
import { latestByKeyword, deltaForKeyword } from "@/lib/core/history";

const STRIKING_MIN = 5;
const STRIKING_MAX = 20;

const GSC_MIN = 11; // page 2 — the real striking-distance band
const GSC_MAX = 20;
const GSC_MIN_IMPRESSIONS = 100;

/** Keywords sitting at #5–20: one page of movement from the top of page 1.
 *  When first-party GSC data exists for a page-2 query, prefer it — the upside
 *  is quantified by REAL impressions, not a DataForSEO estimate. */
export function strikingDistance(input: DetectorInput): Candidate[] {
  const out: Candidate[] = [];
  for (const ks of input.keywordSignals) {
    if (ks.gscPosition != null && ks.gscPosition >= GSC_MIN && ks.gscPosition <= GSC_MAX && (ks.gscImpressions ?? 0) >= GSC_MIN_IMPRESSIONS) {
      out.push({
        type: "striking_distance",
        keyword: ks.keyword,
        keywordId: ks.keywordId,
        volume: ks.gscImpressions, // real demand
        difficulty: ks.difficulty,
        currentPosition: Math.round(ks.gscPosition),
        trend: deltaForKeyword(ks.snapshots, input.asOf, 7),
        evidence: { source: "gsc" },
      });
      continue;
    }
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
      evidence: { source: "estimate" },
    });
  }
  return out;
}
