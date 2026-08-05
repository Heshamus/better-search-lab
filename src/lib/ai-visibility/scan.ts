import { mapLimit } from "@/lib/async/map-limit";
import { detectMention } from "./extract";
import type { AiVisibilitySnapshotData, CitedSource, EngineAnswer, EngineId, PerEngine, PerQuery } from "./types";

// The scan query shape (mirrors queries.ts ScanQuery; kept local to avoid a
// cross-import between the two ai-visibility modules).
type Query = { text: string; source: "gsc" | "generated" };

const hostOf = (u: string): string | null => {
  try {
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
};

/**
 * Run one AI-visibility scan: ask every (query × engine) pair, detect whether the
 * prospect is named/cited, and aggregate per-engine tallies + cited-source counts.
 * Bounded concurrency; a failed engine call counts as zero answers and never sinks
 * the scan (honest under-measurement beats a thrown scan).
 */
export async function runScan(opts: {
  queries: Query[];
  engines: { id: EngineId; model: string }[];
  prospect: { name: string; domain: string };
  ask: (model: string, prompt: string) => Promise<EngineAnswer>;
  limit?: number;
}): Promise<AiVisibilitySnapshotData> {
  const pairs = opts.queries.flatMap((q) => opts.engines.map((e) => ({ q, e })));

  const answers = await mapLimit(pairs, opts.limit ?? 4, async ({ q, e }) => {
    try {
      const ans = await opts.ask(e.model, q.text);
      const { named, cited } = detectMention(ans.answer, ans.citations, opts.prospect);
      return { query: q, engine: e.id, ok: true, named, cited, citations: ans.citations };
    } catch {
      return { query: q, engine: e.id, ok: false, named: false, cited: false, citations: [] as string[] };
    }
  });

  const perEngine = new Map<EngineId, PerEngine>(opts.engines.map((e) => [e.id, { engine: e.id, answers: 0, named: 0, cited: 0 }]));
  const perQuery = new Map<string, PerQuery>(opts.queries.map((q) => [q.text, { text: q.text, source: q.source, named: false, cited: false }]));
  const sources = new Map<string, { count: number; topUrl: string }>();
  let answersTotal = 0;
  let namedTotal = 0;
  let citedTotal = 0;

  for (const r of answers) {
    if (!r.ok) continue; // failed call = 0 answers
    const pe = perEngine.get(r.engine)!;
    const pq = perQuery.get(r.query.text);
    if (pq) {
      if (r.named) pq.named = true;
      if (r.cited) pq.cited = true;
    }
    pe.answers += 1;
    answersTotal += 1;
    if (r.named) {
      pe.named += 1;
      namedTotal += 1;
    }
    if (r.cited) {
      pe.cited += 1;
      citedTotal += 1;
    }
    // Count each distinct cited domain once per answer; remember the first URL.
    const seen = new Set<string>();
    for (const u of r.citations) {
      const host = hostOf(u);
      if (!host || seen.has(host)) continue;
      seen.add(host);
      const cur = sources.get(host);
      if (cur) cur.count += 1;
      else sources.set(host, { count: 1, topUrl: u });
    }
  }

  const citedSources: CitedSource[] = [...sources.entries()]
    .map(([domain, v]) => ({ domain, count: v.count, topUrl: v.topUrl }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  return { queries: opts.queries, perEngine: [...perEngine.values()], perQuery: [...perQuery.values()], namedTotal, citedTotal, answersTotal, citedSources };
}
