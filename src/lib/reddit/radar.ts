import { mapLimit } from "@/lib/async/map-limit";
import type { RedditThread } from "./serpapi";

export interface RadarTerm {
  term: string;
  threadCount: number;
  topThreads: { title: string; subreddit: string; url: string }[];
  volume: number | null; // DataForSEO monthly volume, if known
  page: string | null; // our page that ranks for it (from GSC), or null = content gap
}
export interface RadarSubreddit {
  subreddit: string;
  count: number;
}
export interface RedditRadarData {
  terms: RadarTerm[]; // only fruitful terms (>=1 thread), most-discussed first
  subreddits: RadarSubreddit[]; // where the niche lives, auto-discovered
  termsScanned: number;
  threadsTotal: number;
}

/**
 * Run the Reddit radar over a set of niche terms (relevant by construction — they
 * come from GSC queries / tracked keywords). Searches each via the injected
 * `search`, then keeps only the terms that actually returned discussion (the
 * empirical "likely to yield Reddit results" filter) and auto-discovers the
 * subreddits the niche clusters in. Pure over `search`; bounded concurrency.
 */
export interface TermSpec {
  term: string;
  volume: number | null;
  page: string | null;
}
export interface RadarResult {
  t: TermSpec;
  threads: RedditThread[];
}

export async function runRedditRadar(opts: {
  terms: TermSpec[];
  search: (term: string) => Promise<RedditThread[]>;
  limit?: number;
  // Optional relevance pass over the collected (term, threads) — drops threads
  // that aren't actually about the niche (ambiguous-term noise). Injected so the
  // aggregator stays pure and testable.
  filter?: (results: RadarResult[]) => Promise<RadarResult[]>;
}): Promise<RedditRadarData> {
  const scanned = opts.terms.slice(0, opts.limit ?? 15);
  let results: RadarResult[] = await mapLimit(scanned, 3, async (t) => ({ t, threads: await opts.search(t.term) }));
  if (opts.filter) results = await opts.filter(results);

  const subCount = new Map<string, number>();
  const terms: RadarTerm[] = [];
  let threadsTotal = 0;

  for (const { t, threads } of results) {
    threadsTotal += threads.length;
    for (const th of threads) if (th.subreddit) subCount.set(th.subreddit, (subCount.get(th.subreddit) ?? 0) + 1);
    if (!threads.length) continue; // fruitfulness: no discussion → drop the term
    terms.push({
      term: t.term,
      threadCount: threads.length,
      topThreads: threads.slice(0, 3).map((x) => ({ title: x.title, subreddit: x.subreddit, url: x.url })),
      volume: t.volume,
      page: t.page,
    });
  }

  terms.sort((a, b) => b.threadCount - a.threadCount);
  const subreddits = [...subCount.entries()]
    .map(([subreddit, count]) => ({ subreddit, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  return { terms, subreddits, termsScanned: scanned.length, threadsTotal };
}
