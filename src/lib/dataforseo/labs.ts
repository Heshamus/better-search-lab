import type { DataForSeoClient } from "./client";

export interface KeywordIdea { keyword: string; searchVolume: number | null; cpc: number | null; competition: number | null; difficulty: number | null; }

function num(v: unknown): number | null { return typeof v === "number" ? v : null; }

export async function keywordIdeas(client: DataForSeoClient, p: {
  keywords: string[]; locationCode: number; languageCode: string; limit?: number;
}): Promise<{ items: KeywordIdea[]; rows: number }> {
  const body = [{ keywords: p.keywords, location_code: p.locationCode, language_code: p.languageCode, limit: p.limit ?? 100 }];
  const resp = await client.post<any>("/v3/dataforseo_labs/google/keyword_ideas/live", body);
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
