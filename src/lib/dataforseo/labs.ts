import type { DataForSeoClient } from "./client";
import { assertTasksOk } from "./client";

export interface KeywordIdea { keyword: string; searchVolume: number | null; cpc: number | null; competition: number | null; difficulty: number | null; }

function num(v: unknown): number | null { return typeof v === "number" ? v : null; }

export async function keywordIdeas(client: DataForSeoClient, p: {
  keywords: string[]; locationCode: number; languageCode: string; limit?: number;
}): Promise<{ items: KeywordIdea[]; rows: number }> {
  const body = [{ keywords: p.keywords, location_code: p.locationCode, language_code: p.languageCode, limit: p.limit ?? 100 }];
  const resp = await client.post<any>("/v3/dataforseo_labs/google/keyword_ideas/live", body);
  assertTasksOk(resp);
  const raw = resp?.tasks?.[0]?.result?.[0]?.items ?? [];
  const items: KeywordIdea[] = raw.map((i: any) => ({
    keyword: i.keyword,
    searchVolume: num(i.keyword_info?.search_volume),
    cpc: num(i.keyword_info?.cpc),
    competition: num(i.keyword_info?.competition),
    difficulty: num(i.keyword_properties?.keyword_difficulty),
  }));
  return { items, rows: items.length };
}

// Phrase-match research (like Semrush "Keyword Magic"): returns keywords that
// CONTAIN the seed phrase, ordered by relevance. Far tighter than keyword_ideas,
// whose broad word-overlap turns a seed like "ai seo content" into the generic
// "* ai" app universe (sora ai, muah ai, ai baby...). Single seed, not an array.
export async function keywordSuggestions(client: DataForSeoClient, p: {
  keyword: string; locationCode: number; languageCode: string; limit?: number;
}): Promise<{ items: KeywordIdea[]; rows: number }> {
  const body = [{ keyword: p.keyword, location_code: p.locationCode, language_code: p.languageCode, limit: p.limit ?? 100 }];
  const resp = await client.post<any>("/v3/dataforseo_labs/google/keyword_suggestions/live", body);
  assertTasksOk(resp);
  const raw = resp?.tasks?.[0]?.result?.[0]?.items ?? [];
  const items: KeywordIdea[] = raw.map((i: any) => ({
    keyword: i.keyword,
    searchVolume: num(i.keyword_info?.search_volume),
    cpc: num(i.keyword_info?.cpc),
    competition: num(i.keyword_info?.competition),
    difficulty: num(i.keyword_properties?.keyword_difficulty),
  }));
  return { items, rows: items.length };
}

export interface RankedKeyword { keyword: string; rankAbsolute: number | null; searchVolume: number | null; difficulty: number | null; url: string | null; etv: number | null; }
export async function rankedKeywords(client: DataForSeoClient, p: { target: string; locationCode: number; languageCode: string; limit?: number; }) {
  const body = [{ target: p.target, location_code: p.locationCode, language_code: p.languageCode, limit: p.limit ?? 100 }];
  const resp = await client.post<any>("/v3/dataforseo_labs/google/ranked_keywords/live", body);
  assertTasksOk(resp);
  const raw = resp?.tasks?.[0]?.result?.[0]?.items ?? [];
  const items: RankedKeyword[] = raw.map((i: any) => ({
    keyword: i.keyword_data?.keyword,
    rankAbsolute: num(i.ranked_serp_element?.serp_item?.rank_absolute),
    searchVolume: num(i.keyword_data?.keyword_info?.search_volume),
    difficulty: num(i.keyword_data?.keyword_properties?.keyword_difficulty),
    url: i.ranked_serp_element?.serp_item?.url ?? null,
    etv: num(i.ranked_serp_element?.serp_item?.etv),
  }));
  return { items, rows: items.length };
}

export interface IntersectionRow { keyword: string; searchVolume: number | null; difficulty: number | null; competitorRank: number | null; ourRank: number | null; }
export async function domainIntersection(client: DataForSeoClient, p: { competitor: string; us: string; locationCode: number; languageCode: string; limit?: number; }) {
  const body = [{ target1: p.competitor, target2: p.us, location_code: p.locationCode, language_code: p.languageCode, intersections: false, limit: p.limit ?? 100 }];
  const resp = await client.post<any>("/v3/dataforseo_labs/google/domain_intersection/live", body);
  assertTasksOk(resp);
  const raw = resp?.tasks?.[0]?.result?.[0]?.items ?? [];
  const items: IntersectionRow[] = raw.map((i: any) => ({
    keyword: i.keyword_data?.keyword,
    searchVolume: num(i.keyword_data?.keyword_info?.search_volume),
    difficulty: num(i.keyword_data?.keyword_properties?.keyword_difficulty),
    competitorRank: num(i.first_domain_serp_element?.rank_absolute),
    ourRank: num(i.second_domain_serp_element?.rank_absolute),
  }));
  return { items, rows: items.length };
}

export async function keywordOverview(client: DataForSeoClient, p: { keywords: string[]; locationCode: number; languageCode: string; }): Promise<{ items: KeywordIdea[]; rows: number }> {
  const body = [{ keywords: p.keywords, location_code: p.locationCode, language_code: p.languageCode }];
  const resp = await client.post<any>("/v3/dataforseo_labs/google/keyword_overview/live", body);
  assertTasksOk(resp);
  const raw = resp?.tasks?.[0]?.result?.[0]?.items ?? [];
  const items: KeywordIdea[] = raw.map((i: any) => ({
    keyword: i.keyword,
    searchVolume: num(i.keyword_info?.search_volume),
    cpc: num(i.keyword_info?.cpc),
    competition: num(i.keyword_info?.competition),
    difficulty: num(i.keyword_properties?.keyword_difficulty),
  }));
  return { items, rows: items.length };
}

export interface MonthlyVolume { year: number; month: number; volume: number | null; }

export interface KeywordOverviewRow {
  keyword: string;
  searchVolume: number | null;
  cpc: number | null;
  competition: number | null;
  difficulty: number | null;
  monthly: MonthlyVolume[]; // most recent <=12 months, ascending by (year, month)
  trendPct: number | null;  // 12-month trend %: search_volume_trend.yearly, else computed
}

const HISTORY_MONTHS = 12;

// 12-month trend %: prefer DataForSEO's own year-over-year figure
// (keyword_info.search_volume_trend.yearly); fall back to computing it from the
// trimmed monthly window (first vs last). Guards <2 points and an earliest of
// 0/null (never divide by zero, never fabricate a trend).
function trendPctOf(info: any, monthly: MonthlyVolume[]): number | null {
  const yearly = info?.search_volume_trend?.yearly;
  if (typeof yearly === "number") return yearly;
  const usable = monthly.filter((m) => typeof m.volume === "number");
  if (usable.length < 2) return null;
  const earliest = usable[0].volume as number;
  const latest = usable[usable.length - 1].volume as number;
  if (!earliest) return null;
  return Math.round(((latest - earliest) / earliest) * 100);
}

// Bulk keyword lookup (Semrush-style "Keyword Overview"). Same endpoint as
// `keywordOverview`, but KEEPS the monthly history + trend. DataForSEO returns
// the FULL history (~90 months) newest-first; we sort ascending and keep the most
// recent 12 (the sparkline/CSV window). Left-joins the API items onto the REQUESTED
// list so all N keywords appear in order — DataForSEO omits keywords it has no data
// for, and the UI must still show them.
export async function keywordOverviewBulk(client: DataForSeoClient, p: {
  keywords: string[]; locationCode: number; languageCode: string;
}): Promise<{ rows: KeywordOverviewRow[]; rowsBilled: number }> {
  const body = [{ keywords: p.keywords, location_code: p.locationCode, language_code: p.languageCode }];
  const resp = await client.post<any>("/v3/dataforseo_labs/google/keyword_overview/live", body);
  assertTasksOk(resp);
  const raw = resp?.tasks?.[0]?.result?.[0]?.items ?? [];

  const byKeyword = new Map<string, KeywordOverviewRow>();
  for (const i of raw) {
    const info = i.keyword_info ?? {};
    const monthly: MonthlyVolume[] = (info.monthly_searches ?? [])
      .map((m: any) => ({ year: m.year, month: m.month, volume: num(m.search_volume) }))
      .sort((a: MonthlyVolume, b: MonthlyVolume) => a.year - b.year || a.month - b.month)
      .slice(-HISTORY_MONTHS);
    byKeyword.set(String(i.keyword).toLowerCase(), {
      keyword: i.keyword,
      searchVolume: num(info.search_volume),
      cpc: num(info.cpc),
      competition: num(info.competition),
      difficulty: num(i.keyword_properties?.keyword_difficulty),
      monthly,
      trendPct: trendPctOf(info, monthly),
    });
  }

  const rows: KeywordOverviewRow[] = p.keywords.map(
    (kw) =>
      byKeyword.get(kw.toLowerCase()) ?? {
        keyword: kw, searchVolume: null, cpc: null, competition: null, difficulty: null, monthly: [], trendPct: null,
      },
  );
  return { rows, rowsBilled: p.keywords.length };
}

export interface CompetitorSuggestion { domain: string; intersections: number; avgPosition: number | null; }

/** Domains that rank for the same keywords as `target` (Labs `competitors_domain`), most overlap first. */
export async function competitorsDomain(client: DataForSeoClient, p: {
  target: string; locationCode: number; languageCode: string; limit?: number;
}): Promise<{ items: CompetitorSuggestion[]; rows: number }> {
  const body = [{ target: p.target, location_code: p.locationCode, language_code: p.languageCode, limit: p.limit ?? 10 }];
  const resp = await client.post<any>("/v3/dataforseo_labs/google/competitors_domain/live", body);
  assertTasksOk(resp);
  const raw = resp?.tasks?.[0]?.result?.[0]?.items ?? [];
  const items: CompetitorSuggestion[] = raw
    .filter((i: any) => typeof i.domain === "string" && i.domain)
    .map((i: any) => ({ domain: i.domain, intersections: typeof i.intersections === "number" ? i.intersections : 0, avgPosition: num(i.avg_position) }))
    .sort((a: CompetitorSuggestion, b: CompetitorSuggestion) => b.intersections - a.intersections);
  return { items, rows: items.length };
}
