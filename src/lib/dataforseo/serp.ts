import type { DataForSeoClient } from "./client";
import { assertTasksOk } from "./client";

export interface SerpItem {
  rankAbsolute: number;
  rankGroup: number;
  domain: string;
  url: string;
  serpFeatures: string[];
}

const FEATURE_TYPES = new Set(["featured_snippet", "people_also_ask", "ai_overview", "local_pack"]);
// Features a domain can actually WIN with content (local_pack is a maps result — excluded).
const OWNABLE_TYPES = new Set(["featured_snippet", "people_also_ask", "ai_overview"]);
const normDomain = (d: unknown): string => String(d ?? "").toLowerCase().replace(/^www\./, "");

/**
 * Which capturable SERP features THIS domain currently owns, from the raw SERP
 * items. Ownership lives in different places per type: featured_snippet carries a
 * top-level `domain`; ai_overview cites `references[]`; people_also_ask nests its
 * answering source in each question's `expanded_element`. Subdomain-aware,
 * www-insensitive, and defensive against missing fields.
 */
export function extractOwnedFeatures(raw: any[], ownDomain: string): string[] {
  const target = normDomain(ownDomain);
  if (!target) return [];
  const isOurs = (d: unknown): boolean => {
    const n = normDomain(d);
    return !!n && (n === target || n.endsWith(`.${target}`));
  };
  const owned = new Set<string>();
  for (const i of raw ?? []) {
    const type = i?.type;
    if (!OWNABLE_TYPES.has(type)) continue;
    if (type === "featured_snippet") {
      if (isOurs(i.domain)) owned.add(type);
    } else if (type === "ai_overview") {
      const refs = [...(Array.isArray(i.references) ? i.references : []), ...(Array.isArray(i.items) ? i.items : [])];
      if (refs.some((r: any) => isOurs(r?.domain))) owned.add(type);
    } else if (type === "people_also_ask") {
      const qs = Array.isArray(i.items) ? i.items : [];
      const anyOurs = qs.some((q: any) => {
        const raw = q?.expanded_element ?? q?.items ?? [];
        const els = Array.isArray(raw) ? raw : [raw];
        return els.some((e: any) => isOurs(e?.domain));
      });
      if (anyOurs) owned.add(type);
    }
  }
  return [...owned];
}

export async function serpOrganicLive(client: DataForSeoClient, params: {
  keyword: string; locationCode: number; languageCode: string; device?: string; depth?: number; ownDomain?: string;
}): Promise<{ items: SerpItem[]; ownedFeatures: string[]; rows: number }> {
  const body = [{
    keyword: params.keyword, location_code: params.locationCode,
    language_code: params.languageCode, device: params.device ?? "desktop", depth: params.depth ?? 100,
  }];
  const resp = await client.post<any>("/v3/serp/google/organic/live/advanced", body);
  assertTasksOk(resp);
  const raw = resp?.tasks?.[0]?.result?.[0]?.items ?? [];
  const features = raw.filter((i: any) => FEATURE_TYPES.has(i.type)).map((i: any) => i.type);
  const ownedFeatures = extractOwnedFeatures(raw, params.ownDomain ?? "");
  const items: SerpItem[] = raw
    .filter((i: any) => i.type === "organic")
    .map((i: any) => ({
      rankAbsolute: i.rank_absolute, rankGroup: i.rank_group,
      domain: i.domain, url: i.url, serpFeatures: [...features],
    }));
  return { items, ownedFeatures, rows: raw.length };
}
