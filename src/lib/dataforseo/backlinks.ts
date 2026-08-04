import type { DataForSeoClient } from "./client";
import { assertTasksOk } from "./client";

function num(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}
function int(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

export interface BacklinkSummary {
  rank: number | null; // DataForSEO domain rank (0–1000, DR-like)
  backlinks: number;
  referringDomains: number;
  referringMainDomains: number;
  dofollow: number;
  nofollow: number;
  brokenBacklinks: number;
  spamScore: number | null;
  referringPages: number;
  tldDistribution: { tld: string; count: number }[];
}

export interface ReferringDomain {
  domain: string;
  backlinks: number;
  rank: number | null;
  spamScore: number | null;
}

export interface Anchor {
  anchor: string;
  backlinks: number;
  referringDomains: number;
}

// Overview: total backlinks, referring domains, dofollow/nofollow split, domain
// rank, spam score, and the referring-TLD distribution.
export async function backlinksSummary(client: DataForSeoClient, p: { target: string }): Promise<{ summary: BacklinkSummary; rows: number }> {
  const resp = await client.post<any>("/v3/backlinks/summary/live", [{ target: p.target, backlinks_status_type: "live" }]);
  assertTasksOk(resp);
  const r = resp?.tasks?.[0]?.result?.[0] ?? {};
  const backlinks = int(r.backlinks);
  const nofollow = int(r.referring_links_attributes?.nofollow);
  const tldDistribution = Object.entries(r.referring_links_tld ?? {})
    .map(([tld, count]) => ({ tld, count: Number(count) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  return {
    summary: {
      rank: num(r.rank),
      backlinks,
      referringDomains: int(r.referring_domains),
      referringMainDomains: int(r.referring_main_domains),
      nofollow,
      dofollow: Math.max(0, backlinks - nofollow),
      brokenBacklinks: int(r.broken_backlinks),
      spamScore: num(r.backlinks_spam_score),
      referringPages: int(r.referring_pages),
      tldDistribution,
    },
    rows: 1,
  };
}

// Top referring domains, most backlinks first.
export async function referringDomains(client: DataForSeoClient, p: { target: string; limit?: number }): Promise<{ items: ReferringDomain[]; rows: number }> {
  const resp = await client.post<any>("/v3/backlinks/referring_domains/live", [
    { target: p.target, limit: p.limit ?? 50, order_by: ["backlinks,desc"], backlinks_status_type: "live" },
  ]);
  assertTasksOk(resp);
  const raw = resp?.tasks?.[0]?.result?.[0]?.items ?? [];
  const items: ReferringDomain[] = raw
    .filter((i: any) => i.domain)
    .map((i: any) => ({ domain: i.domain, backlinks: int(i.backlinks), rank: num(i.rank), spamScore: num(i.backlinks_spam_score) }));
  return { items, rows: items.length };
}

// Top anchor texts, most backlinks first.
export async function backlinkAnchors(client: DataForSeoClient, p: { target: string; limit?: number }): Promise<{ items: Anchor[]; rows: number }> {
  const resp = await client.post<any>("/v3/backlinks/anchors/live", [
    { target: p.target, limit: p.limit ?? 20, order_by: ["backlinks,desc"], backlinks_status_type: "live" },
  ]);
  assertTasksOk(resp);
  const raw = resp?.tasks?.[0]?.result?.[0]?.items ?? [];
  const items: Anchor[] = raw.map((i: any) => ({
    anchor: (i.anchor ?? "").trim() || "(empty anchor)",
    backlinks: int(i.backlinks),
    referringDomains: int(i.referring_domains),
  }));
  return { items, rows: items.length };
}
