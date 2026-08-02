import type { SerpItem } from "@/lib/dataforseo/serp";

export function findDomainRank(items: SerpItem[], domain: string) {
  const hit = items.find((i) => i.domain === domain);
  return hit ? { rankAbsolute: hit.rankAbsolute, rankGroup: hit.rankGroup, url: hit.url } : null;
}

export function computeRankDelta(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null) return null;
  return previous - current;
}
