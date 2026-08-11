import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { fetchSite } from "@/lib/crawl/fetch-site";
import { extractSeeds } from "@/lib/crawl/extract-seeds";
import { keywordIdeas, rankedKeywords } from "@/lib/dataforseo/labs";
import { saveProfileCandidates, type ProfileCandidateInput } from "@/lib/profile";
import { logApiUsage, estimateCost, DEEPSEEK_CHAT_ENDPOINT } from "@/lib/dataforseo/cost";
import type { DataForSeoClient } from "@/lib/dataforseo/client";
import { extractNicheSeeds, judgeRelevance, type DeepSeekClient } from "@/lib/llm/deepseek";
import { buildNicheProfile, relevanceScore, DEFAULT_RELEVANCE_THRESHOLD } from "@/lib/core/relevance";
import { normalizeDomain } from "@/lib/competitors";

const IDEAS_ENDPOINT = "/v3/dataforseo_labs/google/keyword_ideas/live";
const RANKED_ENDPOINT = "/v3/dataforseo_labs/google/ranked_keywords/live";
const MAX_CANDIDATES = 300;
const MAX_SEEDS_TO_EXPAND = 10;
// Below this many gate survivors we treat the niche as too thin / the gate as
// too aggressive and switch to relevance-first ranking over ALL candidates
// instead of hard-dropping — never leave a project with a starved candidate set.
const MIN_SURVIVORS = 25;

const byVolumeDesc = (a: { volume: number | null }, b: { volume: number | null }) => (b.volume ?? 0) - (a.volume ?? 0);

// Starvation fallback: rank EVERY candidate by relevance-then-volume and take the
// top MAX_CANDIDATES. Used when a gate would otherwise prune the set below
// MIN_SURVIVORS — a thin niche still yields a full, relevance-first set.
function relevanceRankAll(all: ProfileCandidateInput[], profile: Set<string>): ProfileCandidateInput[] {
  return [...all]
    .sort((a, b) => relevanceScore(b.keyword, profile) - relevanceScore(a.keyword, profile) || byVolumeDesc(a, b))
    .slice(0, MAX_CANDIDATES);
}

// Token-overlap gate (the no-LLM path and the LLM-judge failure fallback): crawl
// phrases and real rankings are inherently on-niche and always kept; only
// expansion candidates must clear the overlap threshold.
function gateByTokenOverlap(all: ProfileCandidateInput[], profile: Set<string>): ProfileCandidateInput[] {
  const survivors = all.filter(
    (c) => c.source !== "expansion" || relevanceScore(c.keyword, profile) >= DEFAULT_RELEVANCE_THRESHOLD,
  );
  return survivors.length < MIN_SURVIVORS ? relevanceRankAll(all, profile) : survivors.sort(byVolumeDesc).slice(0, MAX_CANDIDATES);
}

export function profileSiteHandler(
  client: DataForSeoClient,
  opts?: { fetchImpl?: typeof fetch; llm?: DeepSeekClient | null },
) {
  return async (ctx: { db: any; projectId?: string }) => {
    const { db, projectId } = ctx;
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId!));
    if (!project) return { rows: 0, cost: 0 };
    const loc = project.defaultLocationCode, lang = project.defaultLanguageCode;

    // 1. Crawl (best-effort — never fatal on its own).
    const crawl = await fetchSite(project.domain, { fetchImpl: opts?.fetchImpl });
    // The site's own literal phrases — always added as "crawl" candidates below.
    const crawlSeeds = crawl.failed ? [] : extractSeeds(crawl.pages).map((s) => s.phrase);

    // Decide the EXPANSION seeds and (only in the LLM path) a niche profile to
    // relevance-gate expansion candidates against. Default = current heuristic
    // behavior: expand the crawl seeds, no gate (nicheProfile stays null).
    let expansionSeeds = crawlSeeds;
    let nicheProfile: Set<string> | null = null;
    // The niche the LLM distilled — reused at gate time to SEMANTICALLY judge
    // expansion candidates. Non-null only when extraction succeeded.
    let llmNiche: { seeds: string[]; nicheTerms: string[] } | null = null;
    if (opts?.llm && crawl.pages.length > 0) {
      try {
        const { seeds: llmSeeds, nicheTerms } = await extractNicheSeeds(opts.llm, { pages: crawl.pages, domain: project.domain });
        expansionSeeds = llmSeeds.slice(0, MAX_SEEDS_TO_EXPAND);
        nicheProfile = buildNicheProfile([...nicheTerms, ...llmSeeds].map((term) => ({ keyword: term, tags: [] })));
        llmNiche = { seeds: llmSeeds, nicheTerms };
      } catch (e) {
        // Never gate on a fabricated/absent niche — fall through to the heuristic
        // path (visibly), exactly like the rankedKeywords best-effort catch below.
        console.warn(`profile_site: LLM niche extraction failed for ${project.domain}, falling back to heuristic seeds: ${String((e as { message?: unknown })?.message ?? e)}`);
        expansionSeeds = crawlSeeds;
        nicheProfile = null;
        llmNiche = null;
      }
    }

    // Dedupe on keyword text, first WRITE wins — but crawl seeds are written
    // last (below, after ranking+expansion), not first. A crawl seed carries
    // no real metrics (volume/difficulty are null placeholders); if DataForSEO
    // independently returns that same keyword text via rankings or expansion,
    // the real metrics must win rather than being shadowed by the null-metric
    // placeholder. Crawl only fills in seeds that DataForSEO didn't cover.
    const byKeyword = new Map<string, ProfileCandidateInput>();
    const put = (r: ProfileCandidateInput) => { if (!byKeyword.has(r.keyword)) byKeyword.set(r.keyword, r); };

    let cost = 0, rows = 0;

    // Log the niche-extraction call's spend (one chat request). Logged OUTSIDE the
    // extraction try above so a usage-insert failure can't discard a good niche.
    if (llmNiche) {
      await logApiUsage(db, { endpoint: DEEPSEEK_CHAT_ENDPOINT, rows: 1, projectId });
      cost += estimateCost(DEEPSEEK_CHAT_ENDPOINT, 1);
    }

    // 2. Our own rankings (works even when the crawl failed → the new-site path).
    // NOTE: rankedKeywords does NOT throw for a domain that simply isn't ranked yet —
    // that's a normal 20000/20000 response with an empty items[], handled above the
    // catch with no error. The only thing that reaches this catch is a genuine
    // rankedKeywords FAILURE (a DataForSEO task-level error — bad location_code, an
    // account billing lapse — or an HTTP failure after retries). Keep it best-effort
    // (don't fail the whole job over a rankings-only outage — crawl/expansion can
    // still carry it), but surface it: swallowing a real provider failure silently
    // has previously masked a billing-lapse outage in production for 24h undetected.
    try {
      const { items, rows: n } = await rankedKeywords(client, { target: normalizeDomain(project.domain), locationCode: loc, languageCode: lang, limit: MAX_CANDIDATES });
      for (const it of items) if (it.keyword) put({ keyword: it.keyword, source: "ranking", volume: it.searchVolume, difficulty: it.difficulty });
      await logApiUsage(db, { endpoint: RANKED_ENDPOINT, rows: n, projectId });
      cost += estimateCost(RANKED_ENDPOINT, n); rows += n;
    } catch (e) {
      console.warn(`profile_site: rankedKeywords failed for ${project.domain}, continuing without rankings: ${String((e as { message?: unknown })?.message ?? e)}`);
    }

    // 3. Expand the top seeds via keyword_ideas. In the LLM path these are the
    // tight niche seeds (not the broad crawl phrases that explode into the
    // generic category); in the heuristic path they are the crawl seeds.
    if (expansionSeeds.length) {
      const { items, rows: n } = await keywordIdeas(client, { keywords: expansionSeeds.slice(0, MAX_SEEDS_TO_EXPAND), locationCode: loc, languageCode: lang, limit: MAX_CANDIDATES });
      for (const it of items) if (it.keyword) put({ keyword: it.keyword, source: "expansion", volume: it.searchVolume, difficulty: it.difficulty });
      await logApiUsage(db, { endpoint: IDEAS_ENDPOINT, rows: n, projectId });
      cost += estimateCost(IDEAS_ENDPOINT, n); rows += n;
    }

    // 4. Crawl-derived seeds themselves, for any seed text DataForSEO didn't already return above.
    for (const s of crawlSeeds) put({ keyword: s, source: "crawl", volume: null, difficulty: null });

    // 5. If we have nothing at all (crawl failed AND no rankings AND no expansion), fail loudly.
    const all = [...byKeyword.values()];
    if (all.length === 0) throw new Error(crawl.reason ? `could not profile site: ${crawl.reason}` : "could not profile site: no keywords found");

    // 6. Relevance-gate, THEN cap to top 300. Crawl phrases and real rankings are
    //    inherently on-niche and always kept; only EXPANSION candidates are gated.
    //    - LLM path (niche extracted): a SEMANTIC judge decides expansion. This is
    //      what token-overlap cannot do — it keeps "webflow seo" and drops "people
    //      search" even though both share the niche token "search". Candidates from
    //      any batch the judge couldn't process are dropped fail-CLOSED (precision
    //      over recall); the judge's rejects are trustworthy, so there is NO
    //      relevance-rank starvation rescue re-admitting them. Only if the judge
    //      was ENTIRELY unavailable do we fall back to the token-overlap gate.
    //    - Heuristic path (no LLM / extraction failed): unchanged — top 300 by volume.
    let capped: ProfileCandidateInput[];
    if (opts?.llm && nicheProfile && llmNiche) {
      const profile = nicheProfile;
      try {
        const expansionKeywords = all.filter((c) => c.source === "expansion").map((c) => c.keyword);
        const { kept, calls, unjudged } = await judgeRelevance(opts.llm, {
          domain: project.domain, seeds: llmNiche.seeds, nicheTerms: llmNiche.nicheTerms, candidates: expansionKeywords,
        });
        // Log every BILLED batch call (counted even for a garbled response), so
        // LLM spend is never silent — even when the judge later degrades.
        for (let i = 0; i < calls; i++) await logApiUsage(db, { endpoint: DEEPSEEK_CHAT_ENDPOINT, rows: 1, projectId });
        cost += calls * estimateCost(DEEPSEEK_CHAT_ENDPOINT, 1);

        if (expansionKeywords.length > 0 && unjudged.length === expansionKeywords.length) {
          // Every batch failed → the judge is unavailable, not "nothing relevant".
          // Fall back to the token gate rather than dropping all of expansion.
          console.warn(`profile_site: LLM judge unavailable for ${project.domain} (all ${unjudged.length} candidates unjudged), falling back to token-overlap gate`);
          capped = gateByTokenOverlap(all, profile);
        } else {
          if (unjudged.length) console.warn(`profile_site: ${unjudged.length}/${expansionKeywords.length} expansion candidates could not be judged for ${project.domain}, dropped (fail-closed)`);
          const survivors = all.filter((c) => c.source !== "expansion" || kept.has(c.keyword));
          capped = survivors.sort(byVolumeDesc).slice(0, MAX_CANDIDATES);
        }
      } catch (e) {
        // Defensive: judgeRelevance shouldn't throw (batches are caught inside),
        // but never crash the profile — degrade to the token-overlap gate.
        console.warn(`profile_site: LLM relevance judge errored for ${project.domain}, falling back to token-overlap gate: ${String((e as { message?: unknown })?.message ?? e)}`);
        capped = gateByTokenOverlap(all, profile);
      }
    } else {
      // No LLM (or extraction failed): unchanged heuristic — top 300 by volume.
      capped = all.sort(byVolumeDesc).slice(0, MAX_CANDIDATES);
    }
    await saveProfileCandidates(db, projectId!, capped);
    return { rows, cost };
  };
}
