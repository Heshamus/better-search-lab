// Reddit access via Apify's `trudax/reddit-scraper` actor, run synchronously
// (run-sync-get-dataset-items — one call runs the actor and returns its
// dataset items, no separate poll-for-completion step). Field names below
// mirror Apify's *documented* item shape (body, upVotes, numberOfComments,
// createdAt, url, communityName, comments[]) and the input flags are a
// reasonable guess at the actor's schema; both are confirmed live — and
// corrected here + in the fixture if they differ — in a later probe task
// that runs against a real APIFY_API_KEY.

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

const DEFAULT_ACTOR = "trudax~reddit-scraper";
const MAX_COMMENTS = 5;

function toNumberOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Map one Apify dataset item to RedditPost, defensively (every field optional/malformed-safe). */
function mapItem(raw: any): RedditPost {
  const community = String(raw?.communityName ?? "");
  const comments = Array.isArray(raw?.comments) ? raw.comments : [];
  return {
    id: String(raw?.id ?? ""),
    title: String(raw?.title ?? ""),
    body: String(raw?.body ?? ""),
    url: String(raw?.url ?? ""),
    subreddit: community.replace(/^r\//i, ""),
    upVotes: toNumberOrNull(raw?.upVotes),
    numComments: toNumberOrNull(raw?.numberOfComments),
    createdAt: String(raw?.createdAt ?? ""),
    topComments: comments.slice(0, MAX_COMMENTS).map((c: any) => ({
      body: String(c?.body ?? ""),
      upVotes: toNumberOrNull(c?.upVotes),
    })),
  };
}

/**
 * Run the Apify Reddit scraper actor and map its dataset items to RedditPost.
 * Fail-soft: a non-ok response or a thrown fetch is logged and returns []
 * so one bad scrape never sinks a caller's batch.
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

  const maxItems = input.maxItems ?? 50;
  const body: Record<string, unknown> = {
    searches: input.searches ?? [],
    sort: input.sort ?? "Relevance",
    maxItems,
    maxPostCount: maxItems, // actor param name unconfirmed; harmless if unused
    includeComments: true, // full-scrape flag for engagement + comments; unconfirmed, see file header
    maxComments: MAX_COMMENTS,
  };
  if (input.subredditUrls?.length) {
    body.startUrls = input.subredditUrls.map((u) => ({ url: u }));
  }
  if (input.time) body.time = input.time;

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
    if (!Array.isArray(items)) return [];
    return items.map(mapItem);
  } catch (e) {
    console.error("[apify-reddit] scrape failed", e);
    return [];
  }
}
