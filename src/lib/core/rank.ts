import { normDomain, type SerpItem } from "@/lib/dataforseo/serp";

export function findDomainRank(items: SerpItem[], domain: string) {
  // Case- and www-insensitive: SERP domains are lowercased, but a project's
  // stored domain may be mixed-case ("Example-Site.com"), which a raw === would
  // silently never match — zeroing out the rank.
  const target = normDomain(domain);
  const hit = items.find((i) => normDomain(i.domain) === target);
  return hit ? { rankAbsolute: hit.rankAbsolute, rankGroup: hit.rankGroup, url: hit.url } : null;
}

export function computeRankDelta(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null) return null;
  return previous - current;
}
