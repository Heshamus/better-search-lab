import type { DetectorInput, Candidate, DetectorSnap } from "./types";
import { deltaForKeyword } from "@/lib/core/history";

/**
 * Latest ok snapshot, typed as DetectorSnap (not the narrower Snap that
 * history.ts's latestByKeyword returns) so serpFeatures/ownUrls stay
 * accessible without a cast.
 */
function latestOkSnap(snapshots: DetectorSnap[]): DetectorSnap | null {
  let best: DetectorSnap | null = null;
  for (const s of snapshots) {
    if (s.fetchStatus !== "ok") continue;
    if (!best || s.capturedAt > best.capturedAt) best = s;
  }
  return best;
}

/** ≥2 of our own URLs ranking for one keyword — internal competition splitting authority. */
export function cannibalization(input: DetectorInput): Candidate[] {
  const out: Candidate[] = [];
  for (const ks of input.keywordSignals) {
    const latest = latestOkSnap(ks.snapshots);
    if (!latest || latest.ownUrls.length < 2) continue;
    out.push({
      type: "cannibalization",
      keyword: ks.keyword,
      keywordId: ks.keywordId,
      volume: ks.volume,
      difficulty: ks.difficulty,
      currentPosition: latest.rankAbsolute,
      trend: deltaForKeyword(ks.snapshots, input.asOf, 7),
      evidence: { urls: latest.ownUrls },
    });
  }
  return out;
}
