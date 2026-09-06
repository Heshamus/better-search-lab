import type { RedditPost } from "./apify";
import { scrapeReddit } from "./apify";
import { fetchRedditViaApi, type RedditScrapeInput, type RedditApiConfig } from "./reddit-api";

// A descriptive UA is mandatory — Reddit throttles/blocks generic library UAs.
const DEFAULT_USER_AGENT = "web:better-search-lab:1.0 (self-hosted)";

export interface ConversationFetchEnv {
  REDDIT_CLIENT_ID?: string;
  REDDIT_CLIENT_SECRET?: string;
  REDDIT_USER_AGENT?: string;
  APIFY_API_KEY?: string;
  APIFY_REDDIT_ACTOR?: string;
}

function redditCfg(env: ConversationFetchEnv, fetchImpl?: typeof fetch): RedditApiConfig | null {
  if (!env.REDDIT_CLIENT_ID || !env.REDDIT_CLIENT_SECRET) return null;
  return {
    clientId: env.REDDIT_CLIENT_ID,
    clientSecret: env.REDDIT_CLIENT_SECRET,
    userAgent: env.REDDIT_USER_AGENT || DEFAULT_USER_AGENT,
    fetchImpl,
  };
}

/** True when the conversations pipeline can fetch at all — official API OR Apify. */
export function conversationFetchConfigured(env: ConversationFetchEnv): boolean {
  return Boolean((env.REDDIT_CLIENT_ID && env.REDDIT_CLIENT_SECRET) || env.APIFY_API_KEY);
}

/**
 * Build the `scrape` dependency for the conversations pipeline. Prefers the
 * official Reddit API; if it isn't configured, OR its call THROWS (dead app /
 * revoked creds / network), it transparently falls back to the Apify scraper —
 * so a legacy Reddit-app outage never takes the feature down. Empty results are
 * NOT a fallback trigger (that's a legitimate "no threads today"); only a throw
 * is. Returns [] when neither source is configured.
 */
export function makeConversationScrape(
  env: ConversationFetchEnv,
  fetchImpl?: typeof fetch,
): (input: RedditScrapeInput) => Promise<RedditPost[]> {
  const reddit = redditCfg(env, fetchImpl);
  const apifyKey = env.APIFY_API_KEY;
  return async (input) => {
    if (reddit) {
      try {
        return await fetchRedditViaApi(reddit, input);
      } catch (e) {
        console.warn("[reddit] official API failed — falling back to Apify", e);
      }
    }
    if (apifyKey) return scrapeReddit({ apiKey: apifyKey, actor: env.APIFY_REDDIT_ACTOR, fetchImpl }, input);
    return [];
  };
}
