// Named/cited detection for AI-visibility — ported from an earlier internal
// citation engine (apps/api/src/lib/audit/citations/extract.ts).

/** Citation URLs → unique hosts (www-stripped, lowercase, order-preserving). */
export function domainsFrom(citations: string[]): string[] {
  const out: string[] = [];
  for (const u of citations ?? []) {
    try {
      const host = new URL(u).hostname.replace(/^www\./, "").toLowerCase();
      if (host && !out.includes(host)) out.push(host);
    } catch {
      /* not a URL — skip */
    }
  }
  return out;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Did the AI name or cite the prospect? `named` = brand name OR domain appears in
 * the answer text on a word boundary (no substring false-positives — "Acme"
 * must not match "AcmeShop"). `cited` = a citation host equals the prospect
 * domain or one of its subdomains.
 */
export function detectMention(
  answer: string,
  citations: string[],
  prospect: { name: string; domain: string },
): { named: boolean; cited: boolean } {
  const nameRe = prospect.name.trim()
    ? new RegExp(`(^|[^a-z0-9])${escapeRe(prospect.name.trim())}([^a-z0-9]|$)`, "i")
    : null;
  const domainRe = new RegExp(`(^|[^a-z0-9.-])${escapeRe(prospect.domain)}([^a-z0-9-]|$)`, "i");
  const named = Boolean(nameRe?.test(answer)) || domainRe.test(answer);
  const cited = domainsFrom(citations).some((d) => d === prospect.domain || d.endsWith(`.${prospect.domain}`));
  return { named, cited };
}
