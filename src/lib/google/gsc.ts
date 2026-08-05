// Google Search Console API client (read-only). Lists the user's verified
// properties and queries Search Analytics (clicks / impressions / CTR /
// position) — the free, accurate, 16-month-history source for the OWNER's site.
const BASE = "https://searchconsole.googleapis.com/webmasters/v3";

export interface GscSite {
  siteUrl: string;
  permissionLevel: string;
}

export interface GscRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

// Stored aggregates for the Search Console dashboard.
export interface GscTotals {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}
export interface GscTopRow {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export async function listSites(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<GscSite[]> {
  const res = await fetchImpl(`${BASE}/sites`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`gsc listSites failed: ${res.status} ${await res.text().catch(() => "")}`);
  const j = (await res.json()) as any;
  return (j.siteEntry ?? [])
    .filter((s: any) => s.permissionLevel !== "siteUnverifiedUser")
    .map((s: any) => ({ siteUrl: s.siteUrl, permissionLevel: s.permissionLevel }));
}

// Pick the property that best matches a bare domain. Prefers a domain-property
// ("sc-domain:example.com"), then an https URL-prefix, then any containing the host.
export function matchSite(sites: GscSite[], domain: string): string | null {
  const host = domain.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  const urls = sites.map((s) => s.siteUrl);
  const norm = (u: string) => u.toLowerCase();
  return (
    urls.find((u) => norm(u) === `sc-domain:${host}`) ??
    urls.find((u) => norm(u) === `https://${host}/` || norm(u) === `https://www.${host}/`) ??
    urls.find((u) => norm(u).includes(host)) ??
    null
  );
}

export async function searchAnalytics(
  accessToken: string,
  siteUrl: string,
  p: { startDate: string; endDate: string; dimensions: string[]; rowLimit?: number },
  fetchImpl: typeof fetch = fetch,
): Promise<GscRow[]> {
  const res = await fetchImpl(`${BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ startDate: p.startDate, endDate: p.endDate, dimensions: p.dimensions, rowLimit: p.rowLimit ?? 1000 }),
  });
  if (!res.ok) throw new Error(`gsc searchAnalytics failed: ${res.status} ${await res.text().catch(() => "")}`);
  const j = (await res.json()) as any;
  return (j.rows ?? []).map((r: any) => ({
    keys: r.keys ?? [],
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    ctr: r.ctr ?? 0,
    position: r.position ?? 0,
  }));
}

// A query whose impressions are accelerating: recent-period impressions well
// above the prior period. `prior: 0` = brand-new demand. The earliest, cleanest
// trend signal because it's YOUR first-party demand moving (no third-party lag).
export interface RisingQuery {
  query: string;
  recent: number; // impressions, recent period
  prior: number; // impressions, prior period
  delta: number; // recent - prior
}

/** Rank queries by impressions growth (recent vs prior period), rising first. */
export function computeRisingQueries(
  recent: GscRow[],
  prior: GscRow[],
  opts?: { minRecent?: number; minDelta?: number; limit?: number },
): RisingQuery[] {
  const minRecent = opts?.minRecent ?? 20;
  const minDelta = opts?.minDelta ?? 10;
  const limit = opts?.limit ?? 15;
  const priorMap = new Map<string, number>();
  for (const r of prior) {
    const q = r.keys[0];
    if (q) priorMap.set(q, r.impressions);
  }
  const out: RisingQuery[] = [];
  for (const r of recent) {
    const q = r.keys[0] ?? "";
    if (!q) continue;
    const rec = r.impressions;
    const delta = rec - (priorMap.get(q) ?? 0);
    if (rec < minRecent || delta < minDelta) continue;
    out.push({ query: q, recent: rec, prior: priorMap.get(q) ?? 0, delta });
  }
  return out.sort((a, b) => b.delta - a.delta).slice(0, limit);
}
