// Pure parser for the Keyword Overview textarea: newline- OR comma-separated,
// trimmed, lowercased, de-duplicated (first-seen order kept), capped. `dropped`
// counts ONLY keywords removed by the cap, so the UI can honestly say
// "N dropped over the 100 cap" without also blaming silent dedupe/blank removal.
export function parseKeywordList(raw: string, cap = 100): { keywords: string[]; dropped: number } {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\n,]/)) {
    const kw = part.trim().toLowerCase();
    if (!kw || seen.has(kw)) continue;
    seen.add(kw);
    out.push(kw);
  }
  const dropped = Math.max(0, out.length - cap);
  return { keywords: out.slice(0, cap), dropped };
}
