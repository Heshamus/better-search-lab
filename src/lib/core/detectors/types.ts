// src/lib/core/detectors/types.ts
import type { Snap } from "@/lib/core/history";

export type OpportunityType =
  | "striking_distance" | "decay" | "momentum"
  | "gap" | "serp_feature" | "cannibalization";

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
}

export interface GapSignal {
  keyword: string;
  volume: number | null;
  difficulty: number | null;
  competitorCount: number;
}

export interface DetectorInput {
  keywordSignals: KeywordSignal[];
  gapSignals: GapSignal[];
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
