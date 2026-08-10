import type { RedditPost } from "./apify";
import { mapLimit } from "@/lib/async/map-limit";

// Reddit's official API via application-only OAuth (client_credentials): the app
// signs in as ITSELF (no user, no redirect URI) and reads public listings/search.
// This is the free, first-party replacement for the paid Apify scraper — same
// RedditPost output, same {searches, subredditUrls} input, so it drops straight
// into the conversations pipeline. The token mint THROWS on failure (dead app /
// revoked creds) so the caller can fall back to Apify; per-source listing fetches
// are fail-soft ([]), mirroring scrapeReddit, so one bad query never sinks the run.

const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const OAUTH_BASE = "https://oauth.reddit.com";
const REQUEST_TIMEOUT_MS = 30_000;
const FETCH_CONCURRENCY = 6; // stay well under Reddit's ~100 req/min app-only budget
const DEFAULT_MAX = 25;

export interface RedditApiConfig {
  clientId: string;
  clientSecret: string;
  userAgent: string;
  fetchImpl?: typeof fetch;
}

export interface RedditScrapeInput {
  searches?: string[];
  subredditUrls?: string[];
  sort?: "New" | "Top" | "Comments" | "Relevance";
  time?: "day" | "week";
  maxItems?: number;
}

function toNumberOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Map one Reddit `t3` (link) child's `data` to RedditPost, defensively. */
function mapPost(d: any): RedditPost {
  return {
    id: String(d?.id ?? ""),
    title: String(d?.title ?? "").trim(),
    body: String(d?.selftext ?? ""),
    url: d?.permalink ? `https://www.reddit.com${d.permalink}` : String(d?.url ?? ""),
    subreddit: String(d?.subreddit ?? "").replace(/^r\//i, ""),
    upVotes: toNumberOrNull(d?.ups) ?? toNumberOrNull(d?.score),
    numComments: toNumberOrNull(d?.num_comments),
    createdAt: typeof d?.created_utc === "number" ? new Date(d.created_utc * 1000).toISOString() : "",
    topComments: [], // parity with the Apify actor — per-post comments aren't fetched
  };
}

function subredditName(urlOrName: string): string {
  const m = urlOrName.match(/\/r\/([^/?#]+)/i);
  return (m ? m[1] : urlOrName).replace(/^\/?r\//i, "").trim();
}

/** Mint an app-only access token. THROWS on failure so the caller can fall back. */
export async function getRedditAppToken(cfg: RedditApiConfig): Promise<string> {
  const fetchImpl = cfg.fetchImpl ?? fetch;
  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": cfg.userAgent,
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`reddit app token failed: ${res.status} ${await res.text().catch(() => "")}`);
  const j = (await res.json()) as { access_token?: string };
  if (!j.access_token) throw new Error("reddit app token returned no access_token");
  return j.access_token;
}

/** Fetch one listing/search path. Fail-soft: any non-ok / throw resolves to []. */
async function fetchListing(token: string, cfg: RedditApiConfig, path: string): Promise<RedditPost[]> {
  const fetchImpl = cfg.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(`${OAUTH_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}`, "User-Agent": cfg.userAgent },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error("[reddit-api] non-ok listing", res.status, path);
      return [];
    }
    const j = (await res.json()) as any;
    const children = Array.isArray(j?.data?.children) ? j.data.children : [];
    return children.filter((c: any) => c?.kind === "t3" && c?.data).map((c: any) => mapPost(c.data));
  } catch (e) {
    console.error("[reddit-api] listing failed", path, e);
    return [];
  }
}

/**
 * Read Reddit via the official API. Same shape as scrapeReddit: one search per
 * `searches` entry + one subreddit-top listing per `subredditUrls` entry, merged
 * and deduped by url. Token mint throws (→ Apify fallback); listings are fail-soft.
 */
export async function fetchRedditViaApi(cfg: RedditApiConfig, input: RedditScrapeInput): Promise<RedditPost[]> {
  const token = await getRedditAppToken(cfg); // throws on dead creds → caller falls back
  const limit = Math.min(input.maxItems ?? DEFAULT_MAX, 100);
  const t = input.time ? `&t=${input.time}` : "";

  const paths: string[] = [];
  for (const s of input.subredditUrls ?? []) {
    const sub = subredditName(s);
    if (sub) paths.push(`/r/${encodeURIComponent(sub)}/top?limit=${limit}${t}&raw_json=1`);
  }
  for (const q of input.searches ?? []) {
    paths.push(`/search?q=${encodeURIComponent(q)}&type=link&sort=relevance&limit=${limit}${t}&raw_json=1`);
  }

  const batches = await mapLimit(paths, FETCH_CONCURRENCY, (p) => fetchListing(token, cfg, p));
  const posts = batches.flat();

  const seen = new Set<string>();
  return posts.filter((p) => {
    if (!p.url) return true;
    if (seen.has(p.url)) return false;
    seen.add(p.url);
    return true;
  });
}
