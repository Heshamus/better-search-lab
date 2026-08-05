// Reddit access via SerpApi's Google engine + `site:reddit.com` — Reddit's own
// API is gated behind the Responsible Builder Policy, and SerpApi's plan carries
// legal indemnification for the scraping. We search Google for recent Reddit
// threads discussing a niche term: the threads Google ranks are the ones with
// traction. No native Reddit engine on SerpApi, so this is the supported path.

export interface RedditThread {
  title: string;
  subreddit: string; // e.g. "SEO" (no r/ prefix), "" if not extractable
  url: string;
  position: number; // Google rank
}

const SUBREDDIT_RE = /reddit\.com\/r\/([A-Za-z0-9_]+)/i;
const IS_REDDIT = /(^|\/\/|\.)reddit\.com\//i;

/** Parse SerpApi organic results down to Reddit threads (subreddit extracted). */
export function parseRedditThreads(organicResults: any[]): RedditThread[] {
  const out: RedditThread[] = [];
  for (const r of organicResults ?? []) {
    const link = String(r?.link ?? "");
    if (!IS_REDDIT.test(link)) continue;
    out.push({
      title: String(r?.title ?? "").trim(),
      subreddit: link.match(SUBREDDIT_RE)?.[1] ?? "",
      url: link,
      position: Number(r?.position ?? 0),
    });
  }
  return out;
}

/**
 * Search recent Reddit threads for a niche term via SerpApi. Quoted exact phrase
 * keeps Google's matching tight (avoids "alternate victory" noise). Fail-soft:
 * any error / API error → [] so one bad query never sinks a scan.
 */
export async function searchRedditThreads(
  apiKey: string,
  query: string,
  opts?: { recency?: "d" | "w" | "m" | "y"; num?: number; fetchImpl?: typeof fetch },
): Promise<RedditThread[]> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const params = new URLSearchParams({
    engine: "google",
    q: `"${query}" site:reddit.com`,
    api_key: apiKey,
    num: String(opts?.num ?? 20),
  });
  if (opts?.recency) params.set("tbs", `qdr:${opts.recency}`);
  try {
    const res = await fetchImpl(`https://serpapi.com/search.json?${params.toString()}`, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return [];
    const j = (await res.json()) as any;
    if (j?.error) return [];
    return parseRedditThreads(j.organic_results ?? []);
  } catch {
    return [];
  }
}
