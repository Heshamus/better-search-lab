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

export interface RankedKeyword { keyword: string; rankAbsolute: number | null; searchVolume: number | null; difficulty: number | null; url: string | null; }
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
