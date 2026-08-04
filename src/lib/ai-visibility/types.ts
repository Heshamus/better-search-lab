export type EngineId = "perplexity" | "chatgpt" | "gemini";

export interface EngineAnswer {
  answer: string;
  citations: string[];
}

// Per-engine tallies for one scan.
export interface PerEngine {
  engine: EngineId;
  answers: number; // answers measured for this engine
  named: number; // answers that NAME the prospect (brand/domain in the text)
  cited: number; // answers that CITE the prospect's domain
}

export interface CitedSource {
  domain: string;
  count: number;
  topUrl: string;
}

// Everything one AI-visibility scan produces (stored as one snapshot row).
export interface AiVisibilitySnapshotData {
  queries: { text: string; source: "gsc" | "generated" }[];
  perEngine: PerEngine[];
  namedTotal: number;
  citedTotal: number;
  answersTotal: number;
  citedSources: CitedSource[];
}
