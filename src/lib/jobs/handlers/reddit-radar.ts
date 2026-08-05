import { loadEnv } from "@/config/env";
import { getGscData } from "@/lib/google/store";
import { searchRedditThreads } from "@/lib/reddit/serpapi";
import { runRedditRadar } from "@/lib/reddit/radar";
import { saveRadar } from "@/lib/reddit/store";

const normQ = (s: string): string => s.toLowerCase().trim().replace(/\s+/g, " ");
const MAX_TERMS = 15;
// Skip search-operator / quoted / overlong "queries" — not real search phrases.
const isJunk = (q: string): boolean => q.length > 90 || /\bsite:/i.test(q) || /["']/.test(q);

/**
 * `reddit_radar_scan`: search Reddit (via SerpApi's Google engine) for the
 * project's real niche terms — rising then top GSC queries, each carrying its
 * page-match — and snapshot which terms have active discussion, in which
 * subreddits. The terms are relevant by construction (real demand); the scan
 * itself is the "does it yield Reddit results" filter.
 */
export function redditRadarHandler(opts?: { fetchImpl?: typeof fetch }) {
  return async (ctx: { db: any; projectId?: string }) => {
    const { db, projectId } = ctx;
    const env = loadEnv();
    if (!env.SERPAPI_API_KEY) throw new Error("Reddit radar isn't configured on this instance (SERPAPI_API_KEY missing)");

    const gsc = await getGscData(db, projectId!);
    if (!gsc) throw new Error("Connect Search Console first — the radar's terms come from your real queries");

    const seen = new Set<string>();
    const terms: { term: string; volume: number | null; page: string | null }[] = [];
    const add = (query: string, page: string | null) => {
      const k = normQ(query);
      if (!k || seen.has(k) || isJunk(query) || terms.length >= MAX_TERMS) return;
      seen.add(k);
      terms.push({ term: query, volume: null, page });
    };
    for (const r of gsc.risingQueries) add(r.query, r.page); // accelerating demand first
    for (const q of gsc.topQueries) add(q.key, q.page ?? null);

    const data = await runRedditRadar({
      terms,
      search: (term) => searchRedditThreads(env.SERPAPI_API_KEY!, term, { recency: "m", fetchImpl: opts?.fetchImpl }),
      limit: MAX_TERMS,
    });
    await saveRadar(db, projectId!, data);

    return { rows: data.termsScanned, cost: 0 };
  };
}
