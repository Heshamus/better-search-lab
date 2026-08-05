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

// Per-query outcome across all engines: named/cited if ANY engine named/cited
// the prospect for that query. Drives the "which queries am I invisible on" list.
export interface PerQuery {
  text: string;
  source: "gsc" | "generated";
  named: boolean;
  cited: boolean;
}

// Everything one AI-visibility scan produces (stored as one snapshot row).
export interface AiVisibilitySnapshotData {
  queries: { text: string; source: "gsc" | "generated" }[];
  perEngine: PerEngine[];
  perQuery: PerQuery[];
  namedTotal: number;
  citedTotal: number;
  answersTotal: number;
  citedSources: CitedSource[];
}
