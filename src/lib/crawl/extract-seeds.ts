// Pure HTML → ranked seed phrases. Regex extraction (no DOM lib): title/og:title
// and H1 weigh most, H2 next, meta description least. Phrases are lightly
// cleaned; pure-stopword phrases are dropped. These seeds feed DataForSEO
// keyword_ideas — they are starting points, not final keywords.
export interface Seed { phrase: string; weight: number; }

const STOP = new Set([
  "the","and","for","with","a","an","of","to","in","on","or","your","you","our",
  "is","are","this","that","by","from","at","as","it","be","we","how","what","why",
]);

function firstMatch(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m ? m[1] : null;
}
function allMatches(html: string, re: RegExp): string[] {
  return [...html.matchAll(re)].map((m) => m[1]);
}
function clean(text: string): string {
  return text.toLowerCase().replace(/&[a-z]+;/g, " ").replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ").trim();
}
function isAllStop(phrase: string): boolean {
  const words = phrase.split(" ").filter(Boolean);
  return words.length === 0 || words.every((w) => STOP.has(w) || w.length < 3);
}
// A title like "Trail Running Shoes | Northwind Outdoor" → segments split on
// separators, brand tail dropped by length/last-segment heuristic is left to
// keyword_ideas; here we just yield the cleaned segments.
function segments(text: string): string[] {
  return text.split(/[|–—\-–—:·»]/).map(clean).filter((p) => p && !isAllStop(p));
}

export function extractSeeds(pages: { url: string; html: string }[], limit = 30): Seed[] {
  const weights = new Map<string, number>();
  const add = (phrase: string, w: number) => {
    if (!phrase || isAllStop(phrase)) return;
    weights.set(phrase, Math.max(weights.get(phrase) ?? 0, w));
  };
  for (const { html } of pages) {
    const title = firstMatch(html, /<title[^>]*>([^<]+)<\/title>/i);
    if (title) for (const s of segments(title)) add(s, 5);
    const og = firstMatch(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    if (og) for (const s of segments(og)) add(s, 5);
    for (const h1 of allMatches(html, /<h1[^>]*>([\s\S]*?)<\/h1>/gi)) add(clean(h1.replace(/<[^>]+>/g, " ")), 5);
    for (const h2 of allMatches(html, /<h2[^>]*>([\s\S]*?)<\/h2>/gi)) add(clean(h2.replace(/<[^>]+>/g, " ")), 3);
    const desc = firstMatch(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
    if (desc) for (const s of segments(desc)) add(s, 2);
  }
  return [...weights.entries()]
    .map(([phrase, weight]) => ({ phrase, weight }))
    .sort((a, b) => b.weight - a.weight || a.phrase.localeCompare(b.phrase))
    .slice(0, limit);
}
