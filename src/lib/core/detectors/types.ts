// src/lib/core/detectors/types.ts
import type { Snap } from "@/lib/core/history";

export type OpportunityType =
  | "striking_distance" | "decay" | "momentum"
  | "gap" | "serp_feature" | "cannibalization"
  | "ctr_gap";
// "content_vs_ranking" is added by its detector (Task 4), alongside its
// UPSIDE_CTR_FACTOR + explain handling so the switches stay exhaustive.

/** A rank snapshot enriched with the fields detectors read. */
export type DetectorSnap = Snap & { serpFeatures: string[]; ownUrls: string[] };

export interface KeywordSignal {
  keywordId: string;
  keyword: string;
  tags: string[];
  snapshots: DetectorSnap[];   // this keyword's ok snapshots, chronological
  ownUrls: string[];           // our-domain URLs in the latest SERP (cannibalization)
  volume: number | null;
  difficulty: number | null;
  // First-party GSC signal for this keyword (null when no Google connection or no
  // matching Search Console query). Real impressions/CTR/position — ground truth.
  gscImpressions: number | null;
  gscClicks: number | null;
  gscCtr: number | null;
  gscPosition: number | null;
}

export interface GapSignal {
  keyword: string;
  volume: number | null;
  difficulty: number | null;
  competitorCount: number;
}

/** One of our pages joined across GSC (traffic) and GA (engagement) — the input
 *  the content_vs_ranking detector reads. Empty when no Google connection. */
export interface PageSignal {
  url: string;
  gscClicks: number;
  gscImpressions: number;
  gscPosition: number;
  gaSessions: number;
  gaEngagementRate: number;
  gaConversions: number;
}

export interface DetectorInput {
  keywordSignals: KeywordSignal[];
  gapSignals: GapSignal[];
  pageSignals: PageSignal[];
  asOf: Date;
}

export interface Candidate {
  type: OpportunityType;
  keyword: string;
  keywordId: string | null;
  volume: number | null;
  difficulty: number | null;
  currentPosition: number | null;
  trend: number | null;
  evidence: Record<string, unknown>;
}
