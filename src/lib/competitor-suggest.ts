import { eq } from "drizzle-orm";
import { projects } from "@/db/schema";
import type { DataForSeoClient } from "@/lib/dataforseo/client";
import { competitorsDomain, type CompetitorSuggestion } from "@/lib/dataforseo/labs";
import { logApiUsage } from "@/lib/dataforseo/cost";
import { listCompetitors, normalizeDomain } from "@/lib/competitors";

export const COMPETITORS_DOMAIN_ENDPOINT = "/v3/dataforseo_labs/google/competitors_domain/live";
// Ask for a wide candidate set, then filter down to plausible rivals.
const SUGGEST_LIMIT = 40;
const MAX_RESULTS = 10;
// A domain ranking for more keywords than this is a general platform, not a
// niche competitor. Only applied when the metric is present in the response.
const MAX_ORGANIC_KEYWORDS = 1_000_000;

// General platforms that share keywords with almost any site but are never a
// meaningful SEO competitor. Compared in normalized (no-www) form — this is the
// difference between suggesting a rival and suggesting youtube.com.
export const MEGA_DOMAINS = new Set<string>([
  "youtube.com", "reddit.com", "linkedin.com", "facebook.com", "twitter.com", "x.com",
  "instagram.com", "pinterest.com", "tiktok.com", "threads.net", "wikipedia.org",
  "amazon.com", "ebay.com", "etsy.com", "walmart.com", "quora.com", "medium.com",
  "substack.com", "github.com", "stackoverflow.com", "google.com", "apple.com",
  "microsoft.com", "yahoo.com", "bing.com", "yelp.com", "tripadvisor.com", "booking.com",
  "indeed.com", "glassdoor.com", "fiverr.com", "upwork.com", "shopify.com", "wordpress.com",
  "wix.com", "webflow.com", "squarespace.com", "notion.so", "canva.com", "forbes.com",
  "nytimes.com", "businessinsider.com", "hubspot.com", "g2.com", "capterra.com", "producthunt.com",
]);

/**
 * Suggest competitors for a project (spec §11.3): one Labs call, then keep only
 * plausible rivals — drop the project's own domain, anything already tracked,
 * the general platforms in MEGA_DOMAINS (youtube/reddit/linkedin/…), and any
 * domain too broad to be a competitor (over MAX_ORGANIC_KEYWORDS, when the
 * metric is present). Domains are compared in normalized form so `www.` never
 * hides a duplicate. Returns [] honestly when nothing plausible remains, rather
 * than padding the list with sites that merely share a few generic keywords.
 */
export async function suggestCompetitors(db: any, client: DataForSeoClient, projectId: string): Promise<CompetitorSuggestion[]> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) return [];
  const own = normalizeDomain(project.domain);
  const tracked = new Set((await listCompetitors(db, projectId)).map((c) => normalizeDomain(c.domain)));
  const { items, rows } = await competitorsDomain(client, {
    target: own, locationCode: project.defaultLocationCode, languageCode: project.defaultLanguageCode, limit: SUGGEST_LIMIT,
  });
  await logApiUsage(db, { endpoint: COMPETITORS_DOMAIN_ENDPOINT, rows, projectId });
  const seen = new Set<string>();
  const out: CompetitorSuggestion[] = [];
  for (const it of items) {
    const d = normalizeDomain(it.domain);
    if (!d || d === own || tracked.has(d) || seen.has(d)) continue;
    if (MEGA_DOMAINS.has(d)) continue; // a platform, not a competitor
    if (it.organicCount != null && it.organicCount > MAX_ORGANIC_KEYWORDS) continue; // too broad to be a rival
    seen.add(d);
    out.push({ ...it, domain: d });
    if (out.length >= MAX_RESULTS) break;
  }
  return out;
}
