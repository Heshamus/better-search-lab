import type { Candidate, DetectorInput, OpportunityType } from "@/lib/core/detectors/types";
import { runDetectors } from "@/lib/core/detectors";
import { buildNicheProfile, isRelevant, relevanceScore } from "@/lib/core/relevance";
import { scoreOpportunity, type Weights } from "@/lib/core/scoring";

/**
 * The engine assembler — the pure function that composes everything Phase 1b
 * has built (detectors → niche relevance gate → scoring → top-N) into a
 * ranked opportunity shortlist. "The shortlist is the product": this is the
 * single seam `weekly_opportunities` (Task 9) calls to turn raw signals into
 * what a customer actually reads.
 */

/** A single ranked, human-explained opportunity ready for display/storage. */
export interface EngineResult {
  type: OpportunityType;
  keywordId: string | null;
  keyword: string;
  score: number;
  scoreBreakdown: Record<string, number>;
  why: string;
  upsideEstimate: string | null;
  /** Raw metrics row (Vol/Pos/KD/trend) for the §8 advisor card — copied
   *  straight from the scored `Candidate`, unlike `scoreBreakdown` which is
   *  log-scaled/clamped and conflates null-defaults with real values. Gap
   *  cards (`keywordId: null`) need these to be self-contained since they
   *  can't re-join to `keywords`. */
  volume: number | null;
  difficulty: number | null;
  currentPosition: number | null;
  trend: number | null;
  /** "gsc" when this opportunity is grounded in first-party Search Console/GA
   *  data, "estimate" when it comes from DataForSEO estimates — badged in the UI. */
  dataSource: "gsc" | "estimate";
}

/** Whether a candidate is grounded in first-party data (GSC/GA) or an estimate. */
function dataSourceOf(c: Candidate): "gsc" | "estimate" {
  return c.evidence.source === "gsc" || c.type === "ctr_gap" || c.type === "content_vs_ranking" ? "gsc" : "estimate";
}

/**
 * Rough CTR-uplift factor per opportunity type, applied to monthly search
 * volume for the `upsideEstimate` heuristic ONLY — this never feeds
 * `scoreOpportunity`. Ordered by how directly the opportunity converts into
 * incremental clicks: a top-3 push (striking distance) or winning a SERP
 * feature captures a large, well-documented CTR slice; a brand-new ranking
 * from zero (gap) starts from nothing so the realistic near-term slice is
 * small; momentum/decay/cannibalization are lighter/defensive since they're
 * about press-the-advantage or stop-the-bleed rather than a fresh CTR jump.
 */
const UPSIDE_CTR_FACTOR: Record<OpportunityType, number> = {
  striking_distance: 0.08,
  ctr_gap: 0.06,
  serp_feature: 0.05,
  gap: 0.03,
  momentum: 0.02,
  decay: 0.02,
  cannibalization: 0.02,
  content_vs_ranking: 0.02,
};

const naNum = (n: number | null): string => (n == null ? "n/a" : `${n}`);
const shortPath = (u: string): string => {
  try {
    return new URL(u).pathname || u;
  } catch {
    return u;
  }
};

/** One-line, human, numbers-grounded explanation of why a candidate made the shortlist. */
function explain(c: Candidate): string {
  switch (c.type) {
    case "striking_distance":
      return `Ranks #${naNum(c.currentPosition)} for “${c.keyword}” (${naNum(c.volume)}/mo) — a push into the top 3 is within reach.`;
    case "gap": {
      const competitorCount = c.evidence.competitorCount as number;
      return `${competitorCount} competitors rank for “${c.keyword}” and you don't — winnable at KD ${naNum(c.difficulty)}.`;
    }
    case "momentum":
      return `“${c.keyword}” climbed ${naNum(c.trend)} spots this week — press the advantage.`;
    case "decay": {
      const trend = c.trend ?? 0;
      return `“${c.keyword}” slipped ${-trend} spots — shore it up before it falls further.`;
    }
    case "serp_feature": {
      const feature = c.evidence.feature as string;
      return `A ${feature} is showing for “${c.keyword}” and you're on page 1 — capture it.`;
    }
    case "cannibalization": {
      const urls = c.evidence.urls as string[];
      return `${urls.length} of your URLs compete for “${c.keyword}” — consolidate them.`;
    }
    case "ctr_gap":
      return `You rank #${naNum(c.currentPosition)} for “${c.keyword}” with ${naNum(c.volume)} impressions but click-through is below par — a sharper title/meta wins clicks you're already earning.`;
    case "content_vs_ranking": {
      const rate = Math.round((c.evidence.gaEngagementRate as number) * 100);
      return `“${shortPath(c.keyword)}” ranks and pulls ${naNum(c.volume)} clicks, but only ${rate}% engage — the ranking's fine, the page needs work.`;
    }
    default: {
      const exhaustive: never = c.type;
      throw new Error(`opportunity-engine: no why-template for type ${exhaustive as string}`);
    }
  }
}

/** `"+~N visits/mo"` from volume × the type's CTR-uplift factor, or null when volume is untracked. */
function estimateUpside(c: Candidate): string | null {
  if (c.volume == null) return null;
  const visits = Math.round(c.volume * UPSIDE_CTR_FACTOR[c.type]);
  return `+~${visits} visits/mo`;
}

/**
 * Composes the whole Phase 1b pipeline into a ranked shortlist:
 *   1. `runDetectors` — every candidate across all six detector families.
 *   2. Build the niche profile from the project's own tracked keywords/tags.
 *   3. Drop candidates that fail the relevance gate (generic high-volume
 *      noise, e.g. a "best plumbing near me" gap surfacing for a SaaS site).
 *   4. Score survivors (volume/winnability/position/trend/relevance blend).
 *   5. Sort desc by score, take `topN` (default 25).
 *   6. Attach a human `why` and a rough `upsideEstimate` per result.
 *
 * Pure: no I/O, no `Date.now()`/`new Date()` — "now" is always `input.asOf`.
 * Deterministic for a given input.
 */
export function assembleOpportunities(
  input: DetectorInput,
  opts?: { weights?: Weights; topN?: number; relevanceThreshold?: number },
): EngineResult[] {
  const candidates = runDetectors(input);

  const profile = buildNicheProfile(
    input.keywordSignals.map((k) => ({ keyword: k.keyword, tags: k.tags })),
  );

  // Page-quality candidates (content_vs_ranking) key on a URL, not a search term,
  // and the page is already ours — the keyword-relevance gate doesn't apply, and
  // they carry full relevance.
  const isPageCandidate = (c: Candidate) => c.type === "content_vs_ranking";
  const relevant = candidates.filter((c) => isPageCandidate(c) || isRelevant(c.keyword, profile, opts?.relevanceThreshold));

  const scoredCandidates = relevant
    .map((candidate) => ({
      candidate,
      scored: scoreOpportunity(candidate, isPageCandidate(candidate) ? 1 : relevanceScore(candidate.keyword, profile), opts?.weights),
    }))
    .sort((a, b) => b.scored.score - a.scored.score);

  const topN = opts?.topN ?? 25;

  return scoredCandidates.slice(0, topN).map(({ candidate, scored }) => ({
    type: candidate.type,
    keywordId: candidate.keywordId,
    keyword: candidate.keyword,
    score: scored.score,
    scoreBreakdown: scored.breakdown,
    why: explain(candidate),
    upsideEstimate: estimateUpside(candidate),
    volume: candidate.volume,
    difficulty: candidate.difficulty,
    currentPosition: candidate.currentPosition,
    trend: candidate.trend,
    dataSource: dataSourceOf(candidate),
  }));
}
