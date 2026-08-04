const normQ = (s: string): string => s.toLowerCase().trim().replace(/\s+/g, " ");

export interface ScanQuery {
  text: string;
  source: "gsc" | "generated";
}

/**
 * Build the hybrid scan query set: ~70% from the project's REAL Search Console
 * top queries (test AI visibility where you already earn impressions), ~30% from
 * an injected generator (DeepSeek buyer questions). Deduped case-insensitively
 * across both, bounded to `total`; if one source is short the other fills in, so
 * a thin site or a failed generator still yields a usable set.
 */
export async function buildQueries(opts: {
  gscQueries: string[];
  generate: () => Promise<string[]>;
  total?: number;
}): Promise<ScanQuery[]> {
  const total = opts.total ?? 15;
  const gscTarget = Math.round(total * 0.7);
  const seen = new Set<string>();
  const out: ScanQuery[] = [];

  const add = (text: string, source: ScanQuery["source"]) => {
    const k = normQ(text);
    if (!k || seen.has(k) || out.length >= total) return;
    seen.add(k);
    out.push({ text: text.trim(), source });
  };

  // 1. up to the GSC target from real Search Console queries
  for (const q of opts.gscQueries) {
    if (out.length >= gscTarget) break;
    add(q, "gsc");
  }

  // 2. fill the remainder from generated buyer questions (generator is fail-soft)
  const generated = await opts.generate().catch(() => [] as string[]);
  for (const q of generated) {
    if (out.length >= total) break;
    add(q, "generated");
  }

  // 3. still short (generation ran dry / thin)? top up from any remaining GSC
  if (out.length < total) {
    for (const q of opts.gscQueries) {
      if (out.length >= total) break;
      add(q, "gsc");
    }
  }

  return out;
}
