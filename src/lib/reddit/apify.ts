// Reddit access via Apify's `automation-lab/reddit-scraper` actor, run
// synchronously (run-sync-get-dataset-items — one call runs the actor and
// returns its dataset items, no separate poll-for-completion step).
//
// Confirmed against a real probe: this actor's input model takes ONE source
// per run — either a batch of subreddit URLs, or a single search query — so
// scrapeReddit fires one run per source (in parallel) and merges the
// results, deduping by post url. Output items carry selfText/score/
// numComments/createdAt/subreddit/url and never include per-post comments,
// so topComments is always [].
//
// Previously targeted `trudax/reddit-scraper`, a $45/mo actor rental —
// replaced with this free-tier actor.

export interface RedditPost {
  id: string;
  title: string;
  body: string;
  url: string;
  subreddit: string;
  upVotes: number | null;
  numComments: number | null;
  createdAt: string;
  topComments: { body: string; upVotes: number | null }[];
}

const DEFAULT_ACTOR = "automation-lab~reddit-scraper";
const DEFAULT_MAX_POSTS_PER_SOURCE = 25;

function toNumberOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Map one Apify dataset item to RedditPost, defensively (every field optional/malformed-safe). */
function mapItem(raw: any): RedditPost {
  return {
    id: String(raw?.id ?? ""),
    title: String(raw?.title ?? "").trim(),
    body: String(raw?.selfText ?? ""),
    url: String(raw?.url ?? raw?.permalink ?? ""),
    subreddit: String(raw?.subreddit ?? "").replace(/^r\//i, ""),
    upVotes: toNumberOrNull(raw?.score),
    numComments: toNumberOrNull(raw?.numComments),
    createdAt: String(raw?.createdAt ?? ""),
    topComments: [], // this actor never returns per-post comments
  };
}

/**
 * Run one Apify actor invocation and return its raw dataset items.
 * Fail-soft: a non-ok response or a thrown fetch is logged and resolves to
 * [] so one bad run never sinks the others in scrapeReddit's Promise.all.
 */
async function runOnce(url: string, fetchImpl: typeof fetch, body: Record<string, unknown>): Promise<any[]> {
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[apify-reddit] non-ok response", res.status, detail);
      return [];
    }
    const items = await res.json();
    return Array.isArray(items) ? items : [];
  } catch (e) {
    console.error("[apify-reddit] scrape failed", e);
    return [];
  }
}

/**
 * Scrape Reddit via Apify's automation-lab/reddit-scraper actor and map its
 * dataset items to RedditPost[].
 *
 * The actor accepts one source per run, so this fires one run for the
 * (batched) subreddit URLs plus one run per search term, merges every run's
 * items, dedupes by post url, and maps the survivors. Fail-soft throughout:
 * a failing run just contributes no items rather than aborting the batch,
 * and a fully-failed batch resolves to [].
 */
export async function scrapeReddit(
  cfg: { apiKey: string; actor?: string; fetchImpl?: typeof fetch },
  input: {
    searches?: string[];
    subredditUrls?: string[];
    sort?: "New" | "Top" | "Comments" | "Relevance";
    time?: "day" | "week";
    maxItems?: number;
  },
): Promise<RedditPost[]> {
  const fetchImpl = cfg.fetchImpl ?? fetch;
  const actor = cfg.actor ?? DEFAULT_ACTOR;
  const url = `https://api.apify.com/v2/acts/${encodeURIComponent(actor)}/run-sync-get-dataset-items?token=${encodeURIComponent(cfg.apiKey)}`;
  const maxPostsPerSource = input.maxItems ?? DEFAULT_MAX_POSTS_PER_SOURCE;

  const runs: Promise<any[]>[] = [];
  if (input.subredditUrls?.length) {
    runs.push(
      runOnce(url, fetchImpl, {
        urls: input.subredditUrls,
        sort: (input.sort ?? "top").toLowerCase(),
        timeFilter: input.time,
        maxPostsPerSource,
      }),
    );
  }
  for (const searchQuery of input.searches ?? []) {
    runs.push(
      runOnce(url, fetchImpl, {
        searchQuery,
        sort: "relevance",
        maxPostsPerSource,
      }),
    );
  }

  const results = await Promise.all(runs);
  const posts = results.flat().map(mapItem);

  const seen = new Set<string>();
  return posts.filter((p) => {
    if (!p.url) return true; // nothing to key on; let it through rather than collapsing
    if (seen.has(p.url)) return false;
    seen.add(p.url);
    return true;
  });
}
