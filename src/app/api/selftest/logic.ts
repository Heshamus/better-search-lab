import { assembleOpportunities, type EngineResult } from "@/lib/core/opportunity-engine";
import type { DetectorInput } from "@/lib/core/detectors/types";

/**
 * Hardcoded, in-memory `DetectorInput` exercising the Phase 1b opportunity
 * engine with zero DB and zero network. Two `gapSignals` need no snapshots at
 * all, so they alone would already prove composition; one `KeywordSignal` is
 * included too, with its single snapshot's `keywordId` threaded to match the
 * signal's own `keywordId` exactly. This matters: detectors resolve the
 * latest snapshot via `latestByKeyword(ks.snapshots).get(ks.keywordId)` — a
 * mismatch here silently yields an empty result instead of an error, which is
 * exactly the failure mode this self-test exists to catch (see Task 8's
 * fixture bug, where a mismatched keywordId zeroed out every candidate).
 */
export function buildSyntheticInput(): DetectorInput {
  const keywordId = "selftest-kw-1";
  return {
    keywordSignals: [
      {
        keywordId,
        keyword: "seo reporting software",
        tags: [],
        snapshots: [
          {
            keywordId, // matches KeywordSignal.keywordId above -- required for detectors to resolve it
            capturedAt: new Date("2026-08-03T00:00:00Z"),
            rankAbsolute: 8, // striking distance (5-20)
            fetchStatus: "ok",
            serpFeatures: [],
            ownUrls: [],
          },
        ],
        ownUrls: [],
        volume: 2000,
        difficulty: 25,
        gscImpressions: null,
        gscClicks: null,
        gscCtr: null,
        gscPosition: null,
      },
    ],
    gapSignals: [
      { keyword: "automated seo reporting", volume: 3000, difficulty: 30, competitorCount: 2 },
      { keyword: "software reporting automation", volume: 1500, difficulty: 20, competitorCount: 3 },
    ],
    pageSignals: [],
    asOf: new Date("2026-08-10T00:00:00Z"),
  };
}

/**
 * Runs the pure engine (`assembleOpportunities`) on the synthetic input
 * above. No DB, no network — a live proof that detectors -> relevance gate ->
 * scoring -> shortlist compose correctly in the deployed runtime, not just in
 * tests.
 */
export function runSelftest(): { count: number; sample: EngineResult | null } {
  const results = assembleOpportunities(buildSyntheticInput());
  return { count: results.length, sample: results[0] ?? null };
}
