import type { DetectorInput, Candidate, DetectorSnap } from "./types";
import { deltaForKeyword } from "@/lib/core/history";

const PAGE1 = 10;
const CAPTURABLE = new Set(["featured_snippet", "people_also_ask", "ai_overview"]);

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

/** A page-1 keyword whose latest SERP shows a capturable feature (snippet/PAA/AI overview). */
export function serpFeature(input: DetectorInput): Candidate[] {
  const out: Candidate[] = [];
  for (const ks of input.keywordSignals) {
    const latest = latestOkSnap(ks.snapshots);
    if (!latest || latest.rankAbsolute == null || latest.rankAbsolute > PAGE1) continue;
    const feature = latest.serpFeatures.find((f) => CAPTURABLE.has(f));
    if (!feature) continue;
    out.push({
      type: "serp_feature",
      keyword: ks.keyword,
      keywordId: ks.keywordId,
      volume: ks.volume,
      difficulty: ks.difficulty,
      currentPosition: latest.rankAbsolute,
      trend: deltaForKeyword(ks.snapshots, input.asOf, 7),
      evidence: { feature },
    });
  }
  return out;
}
