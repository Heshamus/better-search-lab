import type { Candidate } from "@/lib/core/detectors/types";

/**
 * Transparent, re-weightable opportunity scoring.
 *
 * Every factor is normalized to [0,1], then multiplied by its weight to
 * produce a per-factor contribution. `breakdown` records those contributions
 * so the UI can show exactly *why* a candidate scored the way it did, and
 * `score` is simply their sum × 100 — re-weighting (e.g. toward winnability
 * for quick-wins, or volume for big-bets) changes both the score and the
 * breakdown deterministically, with no hidden terms.
 */

/** The five scoring factors and their blend weights. Must sum to 1.0. */
export interface Weights {
  volume: number;
  winnability: number;
  position: number;
  trend: number;
  relevance: number;
}

/**
 * Balanced default: volume (opportunity size) and winnability (inverse
 * difficulty) weighted equally as the two headline axes, position and
 * relevance as supporting signals, trend lightest since it's frequently
 * null (untracked/gap candidates) or noisy week-over-week.
 */
export const DEFAULT_WEIGHTS: Weights = {
  volume: 0.25,
  winnability: 0.25,
  position: 0.2,
  trend: 0.1,
  relevance: 0.2,
};

export interface Scored {
  score: number;
  breakdown: Record<string, number>;
}

/** Monthly search volume the [0,1] volume factor treats as "maximal" — log-scaled so a 10k+/mo keyword doesn't swamp the blend. */
export const VOLUME_CAP = 10_000;
/** WoW rank-delta magnitude (positions) treated as a "maximal" trend swing. */
export const TREND_CAP = 10;
/** Position factor for untracked candidates (e.g. gaps) with no known rank. */
export const GAP_POSITION_PRIOR = 0.5;

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** `log10(1+volume) / log10(1+VOLUME_CAP)`, capped at 1; null volume → 0. */
function volumeFactor(volume: number | null): number {
  const v = volume ?? 0;
  return Math.min(1, Math.log10(1 + v) / Math.log10(1 + VOLUME_CAP));
}

/** `1 - difficulty/100`; unscored (null) difficulty defaults to 50 (neutral). */
function winnabilityFactor(difficulty: number | null): number {
  return 1 - (difficulty ?? 50) / 100;
}

/** Closeness to page 1. Ranked candidates: `(101 - position)/100`. Unranked (gaps): fixed prior. */
function positionFactor(currentPosition: number | null): number {
  if (currentPosition === null) return GAP_POSITION_PRIOR;
  return (101 - currentPosition) / 100;
}

/** WoW rank delta clamped to [-TREND_CAP, TREND_CAP] then mapped to [0,1]; null trend → 0.5 (neutral). */
function trendFactor(trend: number | null): number {
  if (trend === null) return 0.5;
  return (clamp(trend / TREND_CAP, -1, 1) + 1) / 2;
}

/**
 * Scores a candidate against a niche-relevance score (already 0..1) and a
 * set of weights (defaulting to `DEFAULT_WEIGHTS`). Pure function: same
 * inputs always produce the same `{ score, breakdown }`.
 *
 * `breakdown` is keyed by weight name (`volume`, `winnability`, `position`,
 * `trend`, `relevance`); each value is `normalizedFactor * weight`. `score`
 * is `Σ breakdown × 100`, in (0,100] for in-range inputs.
 */
export function scoreOpportunity(
  c: Candidate,
  relevance: number,
  weights: Weights = DEFAULT_WEIGHTS,
): Scored {
  const factors: Weights = {
    volume: volumeFactor(c.volume),
    winnability: winnabilityFactor(c.difficulty),
    position: positionFactor(c.currentPosition),
    trend: trendFactor(c.trend),
    relevance,
  };

  const breakdown: Record<string, number> = {};
  let sum = 0;
  for (const key of Object.keys(factors) as (keyof Weights)[]) {
    const contribution = factors[key] * weights[key];
    breakdown[key] = contribution;
    sum += contribution;
  }

  return { score: sum * 100, breakdown };
}
