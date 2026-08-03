import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { fetchSite } from "@/lib/crawl/fetch-site";
import { extractSeeds } from "@/lib/crawl/extract-seeds";
import { keywordIdeas, rankedKeywords } from "@/lib/dataforseo/labs";
import { saveProfileCandidates, type ProfileCandidateInput } from "@/lib/profile";
import { logApiUsage, estimateCost } from "@/lib/dataforseo/cost";
import type { DataForSeoClient } from "@/lib/dataforseo/client";

const IDEAS_ENDPOINT = "/v3/dataforseo_labs/google/keyword_ideas/live";
const RANKED_ENDPOINT = "/v3/dataforseo_labs/google/ranked_keywords/live";
const MAX_CANDIDATES = 300;
const MAX_SEEDS_TO_EXPAND = 10;

const byVolumeDesc = (a: { volume: number | null }, b: { volume: number | null }) => (b.volume ?? 0) - (a.volume ?? 0);

export function profileSiteHandler(client: DataForSeoClient, opts?: { fetchImpl?: typeof fetch }) {
  return async (ctx: { db: any; projectId?: string }) => {
    const { db, projectId } = ctx;
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId!));
    if (!project) return { rows: 0, cost: 0 };
    const loc = project.defaultLocationCode, lang = project.defaultLanguageCode;

    // 1. Crawl (best-effort — never fatal on its own).
    const crawl = await fetchSite(project.domain, { fetchImpl: opts?.fetchImpl });
    const seeds = crawl.failed ? [] : extractSeeds(crawl.pages).map((s) => s.phrase);

    // Dedupe on keyword text, first WRITE wins — but crawl seeds are written
    // last (below, after ranking+expansion), not first. A crawl seed carries
    // no real metrics (volume/difficulty are null placeholders); if DataForSEO
    // independently returns that same keyword text via rankings or expansion,
    // the real metrics must win rather than being shadowed by the null-metric
    // placeholder. Crawl only fills in seeds that DataForSEO didn't cover.
    const byKeyword = new Map<string, ProfileCandidateInput>();
    const put = (r: ProfileCandidateInput) => { if (!byKeyword.has(r.keyword)) byKeyword.set(r.keyword, r); };

    let cost = 0, rows = 0;

    // 2. Our own rankings (works even when the crawl failed → the new-site path).
    try {
      const { items, rows: n } = await rankedKeywords(client, { target: project.domain, locationCode: loc, languageCode: lang, limit: MAX_CANDIDATES });
      for (const it of items) if (it.keyword) put({ keyword: it.keyword, source: "ranking", volume: it.searchVolume, difficulty: it.difficulty });
      await logApiUsage(db, { endpoint: RANKED_ENDPOINT, rows: n, projectId });
      cost += estimateCost(RANKED_ENDPOINT, n); rows += n;
    } catch { /* no rankings yet (brand-new site) — fine, seeds+expansion carry it */ }

    // 3. Expand the top seeds via keyword_ideas.
    if (seeds.length) {
      const { items, rows: n } = await keywordIdeas(client, { keywords: seeds.slice(0, MAX_SEEDS_TO_EXPAND), locationCode: loc, languageCode: lang, limit: MAX_CANDIDATES });
      for (const it of items) if (it.keyword) put({ keyword: it.keyword, source: "expansion", volume: it.searchVolume, difficulty: it.difficulty });
      await logApiUsage(db, { endpoint: IDEAS_ENDPOINT, rows: n, projectId });
      cost += estimateCost(IDEAS_ENDPOINT, n); rows += n;
    }

    // 4. Crawl-derived seeds themselves, for any seed text DataForSEO didn't already return above.
    for (const s of seeds) put({ keyword: s, source: "crawl", volume: null, difficulty: null });

    // 5. If we have nothing at all (crawl failed AND no rankings AND no expansion), fail loudly.
    const all = [...byKeyword.values()];
    if (all.length === 0) throw new Error(crawl.reason ? `could not profile site: ${crawl.reason}` : "could not profile site: no keywords found");

    // 6. Cap to top 300 by volume, persist (replace).
    const capped = all.sort(byVolumeDesc).slice(0, MAX_CANDIDATES);
    await saveProfileCandidates(db, projectId!, capped);
    return { rows, cost };
  };
}
