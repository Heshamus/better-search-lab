import type { DataForSeoClient } from "./client";

export interface SerpItem {
  rankAbsolute: number;
  rankGroup: number;
  domain: string;
  url: string;
  serpFeatures: string[];
}

const FEATURE_TYPES = new Set(["featured_snippet", "people_also_ask", "ai_overview", "local_pack"]);

export async function serpOrganicLive(client: DataForSeoClient, params: {
  keyword: string; locationCode: number; languageCode: string; device?: string; depth?: number;
}): Promise<{ items: SerpItem[]; rows: number }> {
  const body = [{
    keyword: params.keyword, location_code: params.locationCode,
    language_code: params.languageCode, device: params.device ?? "desktop", depth: params.depth ?? 100,
  }];
  const resp = await client.post<any>("/v3/serp/google/organic/live/advanced", body);
  const raw = resp?.tasks?.[0]?.result?.[0]?.items ?? [];
  const features = raw.filter((i: any) => FEATURE_TYPES.has(i.type)).map((i: any) => i.type);
  const items: SerpItem[] = raw
    .filter((i: any) => i.type === "organic")
    .map((i: any) => ({
      rankAbsolute: i.rank_absolute, rankGroup: i.rank_group,
      domain: i.domain, url: i.url, serpFeatures: [...features],
    }));
  return { items, rows: raw.length };
}
