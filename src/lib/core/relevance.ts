/**
 * Dependency-free niche relevance gate.
 *
 * Keeps opportunity candidates on-topic for a project by comparing a
 * candidate keyword's salient vocabulary against a niche profile built from
 * the project's own tracked keywords + tags. Pure string/Set logic — this is
 * what stops generic high-volume noise (e.g. "best plumbing services near
 * me") from surfacing as an "opportunity" for an unrelated SaaS site.
 */

/**
 * Generic, low-information words dropped before computing overlap. Deliberately
 * excludes topical anchor words that read as "generic" in isolation but are
 * load-bearing for real niches — e.g. "service" (ITSM/professional/financial/
 * customer-service sites) and "new" (real-estate/automotive) — since this same
 * tokenizer also builds the niche profile itself; stopping those words would
 * erase the one term tying a real service- or new-product-industry niche
 * together. Only words shorter than 3 chars would be dropped by the length
 * filter anyway, so 1-2 char entries are omitted here as dead weight.
 */
const STOPWORDS = new Set([
  "the", "are",
  "and", "for", "with", "how", "what", "why", "who", "when", "where",
  "your", "you", "our", "their", "his", "her", "its",
  "best", "top", "near", "good", "great",
  "get", "buy", "free", "cheap", "guide",
]);

/** Splits on any run of non-alphanumeric characters and drops empties. */
function splitWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0);
}

/** Strips a trailing "s" for light singularization; guards short words and trailing "ss". */
function singularize(word: string): string {
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) {
    return word.slice(0, -1);
  }
  return word;
}

/**
 * Tokenizes free text into salient tokens: lowercased, split on
 * non-alphanumerics, short (<3 char) tokens dropped, light-singularized,
 * then stopwords dropped.
 */
function salientTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of splitWords(text)) {
    if (raw.length < 3) continue;
    const word = singularize(raw);
    if (STOPWORDS.has(word)) continue;
    out.add(word);
  }
  return out;
}

/** Default overlap-coefficient threshold: at least ~1/3 of a candidate's salient tokens must be on-profile. */
export const DEFAULT_RELEVANCE_THRESHOLD = 0.34;

/**
 * Builds a project's niche vocabulary from its tracked keywords + tags: the
 * union of every seed's salient tokens.
 */
export function buildNicheProfile(
  seed: { keyword: string; tags: string[] }[],
): Set<string> {
  const profile = new Set<string>();
  for (const s of seed) {
    for (const t of salientTokens(s.keyword)) profile.add(t);
    for (const tag of s.tags) for (const t of salientTokens(tag)) profile.add(t);
  }
  return profile;
}

/**
 * Overlap coefficient of a keyword's salient tokens with the niche profile:
 * |candidateSalientTokens ∩ profile| / |candidateSalientTokens|, in [0,1].
 * 0 when the candidate has no salient tokens.
 */
export function relevanceScore(keyword: string, profile: Set<string>): number {
  const tokens = salientTokens(keyword);
  if (tokens.size === 0) return 0;
  let hits = 0;
  for (const t of tokens) if (profile.has(t)) hits += 1;
  return hits / tokens.size;
}

/**
 * True when `keyword`'s relevance score clears `threshold`. An empty profile
 * (no tracked keywords yet) always passes: the gate exists to remove noise
 * from an established niche, not to block a project that hasn't been
 * profiled yet (fail-open).
 */
export function isRelevant(
  keyword: string,
  profile: Set<string>,
  threshold: number = DEFAULT_RELEVANCE_THRESHOLD,
): boolean {
  if (profile.size === 0) return true;
  return relevanceScore(keyword, profile) >= threshold;
}
