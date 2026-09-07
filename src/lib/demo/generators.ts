import type { Rng } from "./prng";
import type { BacklinkSummary, ReferringDomain, Anchor } from "@/lib/dataforseo/backlinks";
import type { AuditIssue } from "@/lib/audit/checks";
import type { PerEngine, PerQuery, CitedSource } from "@/lib/ai-visibility/types";
import type { GscTotals, GscTopRow, RisingQuery } from "@/lib/google/gsc";
import type { GaTotals, GaChannelRow, GaPageRow } from "@/lib/google/analytics";
import type { IntersectionRow } from "@/lib/dataforseo/labs";
import type { NewConversation } from "@/lib/reddit/conversations-store";
import type { OrganicKeywordRow } from "@/lib/organic-keywords-store";

// Two synthetic projects (spec §13). Names and domains are fictional; every
// number below is generated, anchored to "now", and deterministic per seed.
export interface DemoProjectSpec {
  seed: number;
  name: string;
  domain: string;
  keywordCount: number;
  competitors: string[];
  terms: string[];
  modifiers: string[];
  subreddits: string[];
  knowledgeBrief: string;
}

export const DEMO_PROJECTS: DemoProjectSpec[] = [
  {
    seed: 20260901, name: "Northwind Outdoor", domain: "northwind-outdoor.example", keywordCount: 140,
    competitors: ["summitpeak.example", "trailhead-gear.example", "basecamp-supply.example"],
    terms: ["trail running shoes", "hiking boots", "ultralight tent", "sleeping bag", "hydration pack", "trekking poles", "rain jacket", "camp stove", "headlamp", "merino base layer", "backpacking backpack", "down jacket", "climbing harness", "camping chair", "water filter"],
    modifiers: ["best", "lightweight", "waterproof", "budget", "women's", "men's", "for beginners", "review", "vs", "sale", "size guide", "how to choose"],
    subreddits: ["Ultralight", "hiking", "CampingGear", "trailrunning"],
    knowledgeBrief: "Northwind Outdoor sells tested hiking, camping and trail-running gear with honest weight and durability specs.",
  },
  {
    seed: 20260902, name: "Harbor & Vale Legal", domain: "harborvale-law.example", keywordCount: 40,
    competitors: ["coastline-attorneys.example", "meridian-law.example"],
    terms: ["personal injury lawyer", "car accident attorney", "estate planning", "small business lawyer", "divorce attorney", "employment lawyer", "immigration attorney", "real estate lawyer"],
    modifiers: ["near me", "cost", "free consultation", "how to choose", "reviews", "what does a", "when to hire"],
    subreddits: ["legaladvice", "smallbusiness", "personalfinance"],
    knowledgeBrief: "Harbor & Vale is a regional law firm for individuals and small businesses, known for plain-language guidance.",
  },
];

export interface DemoKeyword { keyword: string; volume: number; difficulty: number; cpc: number; competition: number }
export interface DemoRankSeries { keyword: string; points: (number | null)[]; url: string }
export interface DemoProjectData {
  keywords: DemoKeyword[];
  rankSeries: DemoRankSeries[];
  competitors: string[];
  competitorKeywords: { domain: string; rows: { keyword: string; rankAbsolute: number | null; url: string | null; volume: number | null; difficulty: number | null }[] }[];
  gaps: { domain: string; rows: IntersectionRow[] }[];
  organic: OrganicKeywordRow[];
  backlinkSnapshots: { at: Date; summary: BacklinkSummary; referringDomains: ReferringDomain[]; anchors: Anchor[] }[];
  audit: { score: number; pagesCrawled: number; issues: AuditIssue[] };
  gscDaily: { date: string; clicks: number; impressions: number; ctr: number; position: number }[];
  gscSnapshot: { totals: GscTotals; topQueries: GscTopRow[]; topPages: GscTopRow[]; risingQueries: RisingQuery[] };
  gaDaily: { date: string; sessions: number; users: number }[];
  gaSnapshot: { totals: GaTotals; channels: GaChannelRow[]; topPages: GaPageRow[] };
  aiScans: { at: Date; queries: { text: string; source: "gsc" | "generated" }[]; engines: PerEngine[]; perQuery: PerQuery[]; namedTotal: number; citedTotal: number; answersTotal: number; citedSources: CitedSource[] }[];
  conversations: { scanDate: string; rows: NewConversation[] }[];
  usage: { at: Date; endpoint: string; rows: number; cost: number }[];
}

const DAYS = 90;
const isoDay = (d: Date): string => d.toISOString().slice(0, 10);
const daysAgo = (now: Date, n: number): Date => new Date(now.getTime() - n * 86_400_000);
const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function makeKeywords(spec: DemoProjectSpec, rng: Rng): DemoKeyword[] {
  const out: DemoKeyword[] = [];
  const seen = new Set<string>();
  const combos: string[] = [];
  for (const t of spec.terms) { combos.push(t); for (const m of spec.modifiers) combos.push(m.startsWith("vs") || m === "review" || m === "sale" || m === "cost" || m === "reviews" || m === "near me" || m === "size guide" ? `${t} ${m}` : `${m} ${t}`); }
  for (const c of combos) {
    if (out.length >= spec.keywordCount) break;
    if (seen.has(c)) continue;
    seen.add(c);
    const head = spec.terms.includes(c);
    out.push({
      keyword: c,
      volume: head ? rng.int(4000, 40000) : rng.int(50, 3000),
      difficulty: head ? rng.int(45, 80) : rng.int(8, 55),
      cpc: Number(rng.float(0.2, 6).toFixed(2)),
      competition: Number(rng.float(0.05, 0.95).toFixed(2)),
    });
  }
  return out;
}

/** A daily rank walk: a start position, a drift (improving, flat, or decaying), small noise, occasional drop-outs. */
function rankWalk(rng: Rng, days: number): (number | null)[] {
  const mode = rng.pick(["top", "striking", "climbing", "decaying", "deep", "unranked"] as const);
  let pos =
    mode === "top" ? rng.int(1, 3) : mode === "striking" ? rng.int(5, 15) : mode === "climbing" ? rng.int(25, 45) : mode === "decaying" ? rng.int(3, 8) : mode === "deep" ? rng.int(40, 90) : 0;
  const drift = mode === "climbing" ? -0.25 : mode === "decaying" ? 0.18 : 0;
  const points: (number | null)[] = [];
  for (let i = 0; i < days; i++) {
    if (mode === "unranked") { points.push(rng.chance(0.9) ? null : rng.int(60, 100)); continue; }
    pos = pos + drift + rng.float(-1.2, 1.2);
    pos = Math.max(1, Math.min(100, pos));
    points.push(rng.chance(0.03) ? null : Math.round(pos));
  }
  return points;
}

function makeBacklinks(spec: DemoProjectSpec, now: Date, rng: Rng): DemoProjectData["backlinkSnapshots"] {
  const out: DemoProjectData["backlinkSnapshots"] = [];
  let backlinks = rng.int(900, 4000), domains = rng.int(120, 400);
  const refDomains = Array.from({ length: 50 }, (_, i) => `ref-${i + 1}-${slug(spec.terms[i % spec.terms.length])}.example`);
  for (let week = 11; week >= 0; week--) {
    backlinks += rng.int(5, 60); domains += rng.int(0, 8);
    const summary: BacklinkSummary = {
      rank: rng.int(20, 60), backlinks, referringDomains: domains, referringMainDomains: Math.round(domains * 0.9),
      dofollow: Math.round(backlinks * 0.72), nofollow: Math.round(backlinks * 0.28), brokenBacklinks: rng.int(0, 30),
      spamScore: rng.int(1, 12), referringPages: Math.round(backlinks * 0.8),
      tldDistribution: [{ tld: "com", count: Math.round(domains * 0.6) }, { tld: "org", count: Math.round(domains * 0.15) }, { tld: "io", count: Math.round(domains * 0.1) }, { tld: "net", count: Math.round(domains * 0.15) }],
    };
    out.push({
      at: daysAgo(now, week * 7),
      summary,
      referringDomains: refDomains.map((domain, i) => ({ domain, backlinks: rng.int(1, 40) + (i < 5 ? 40 : 0), rank: rng.int(5, 70), spamScore: rng.int(0, 20) })),
      anchors: spec.terms.slice(0, 20).map((anchor) => ({ anchor, backlinks: rng.int(2, 80), referringDomains: rng.int(1, 30) })),
    });
  }
  return out;
}

function makeAudit(spec: DemoProjectSpec, rng: Rng): DemoProjectData["audit"] {
  const pages = spec.terms.map((t) => `https://${spec.domain}/${slug(t)}`);
  const issue = (id: string, label: string, category: AuditIssue["category"], severity: AuditIssue["severity"], n: number, help: string): AuditIssue => ({
    id, label, category, severity, count: n, affected: pages.slice(0, Math.min(n, 5)), help,
  });
  const issues = [
    issue("missing-meta-description", "Missing meta description", "Meta", "warning", rng.int(2, 6), "Write a 120–155 character description for each page."),
    issue("title-too-long", "Title over 60 characters", "Meta", "notice", rng.int(1, 4), "Shorten the title so it is not truncated in results."),
    issue("thin-content", "Thin content (under 300 words)", "Content", "warning", rng.int(1, 3), "Expand the page or merge it into a stronger one."),
    issue("missing-h1", "Missing H1", "Structure", "error", rng.int(0, 2), "Every page needs exactly one H1 naming its topic."),
    issue("images-missing-alt", "Images without alt text", "Content", "notice", rng.int(3, 12), "Describe each image in its alt attribute."),
  ].filter((i) => i.count > 0);
  const penalty = issues.reduce((s, i) => s + i.count * (i.severity === "error" ? 6 : i.severity === "warning" ? 2 : 1), 0);
  return { score: Math.max(40, 100 - penalty), pagesCrawled: pages.length + rng.int(5, 20), issues };
}

function makeSeries(now: Date, rng: Rng, base: number, growth: number): { gsc: DemoProjectData["gscDaily"]; ga: DemoProjectData["gaDaily"] } {
  const gsc: DemoProjectData["gscDaily"] = [];
  const ga: DemoProjectData["gaDaily"] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const date = isoDay(daysAgo(now, i));
    const weekend = [0, 6].includes(daysAgo(now, i).getUTCDay());
    const trend = 1 + growth * ((DAYS - 1 - i) / DAYS);
    const impressions = Math.round(base * 30 * trend * (weekend ? 0.7 : 1) * rng.float(0.85, 1.15));
    const ctr = rng.float(0.018, 0.035);
    const clicks = Math.round(impressions * ctr);
    gsc.push({ date, clicks, impressions, ctr: Number(ctr.toFixed(4)), position: Number(rng.float(9, 16).toFixed(1)) });
    const sessions = Math.round(clicks * rng.float(1.6, 2.4));
    ga.push({ date, sessions, users: Math.round(sessions * rng.float(0.75, 0.9)) });
  }
  return { gsc, ga };
}

/**
 * Six separate daily scans over the last week, each surfacing one thread —
 * mirrors how the real Reddit scan runs (one saveConversations call per
 * scanDate) and keeps `conversations` sized per DAY, not per row.
 */
function makeConversations(spec: DemoProjectSpec, now: Date, rng: Rng): DemoProjectData["conversations"] {
  return Array.from({ length: 6 }, (_, i): { scanDate: string; rows: NewConversation[] } => {
    const term = spec.terms[i % spec.terms.length];
    const sub = spec.subreddits[i % spec.subreddits.length];
    const row: NewConversation = {
      threadUrl: `https://www.reddit.com/r/${sub}/comments/demo${spec.seed % 100}${i}/${slug(term)}/`,
      subreddit: sub,
      title: `Looking for recommendations: ${term}?`,
      upVotes: rng.int(5, 400),
      numComments: rng.int(3, 120),
      postedAt: daysAgo(now, i + 1),
      whyItMatters: `A buyer is comparing options for ${term}; the thread ranks for the query and has no expert answer yet.`,
      draftReply: `Depends on how you'll use it. For ${term}, look at weight, durability and return policy first — happy to share the comparison we ran.`,
      citations: [`https://${spec.domain}/${slug(term)}`],
      promoRisk: rng.pick(["low", "medium"] as const),
      status: "new",
    };
    return { scanDate: isoDay(daysAgo(now, i + 1)), rows: [row] };
  });
}

function makeRankSeries(spec: DemoProjectSpec, keywords: DemoKeyword[], rng: Rng): DemoRankSeries[] {
  return keywords.map((k) => ({ keyword: k.keyword, points: rankWalk(rng, DAYS), url: `https://${spec.domain}/${slug(k.keyword)}` }));
}

function makeCompetitorKeywords(spec: DemoProjectSpec, keywords: DemoKeyword[], rng: Rng): DemoProjectData["competitorKeywords"] {
  return spec.competitors.map((domain) => ({
    domain,
    rows: keywords.filter(() => rng.chance(0.6)).map((k) => ({ keyword: k.keyword, rankAbsolute: rng.int(1, 40), url: `https://${domain}/${slug(k.keyword)}`, volume: k.volume, difficulty: k.difficulty })),
  }));
}

function makeGaps(spec: DemoProjectSpec, rng: Rng): DemoProjectData["gaps"] {
  return spec.competitors.map((domain) => ({
    domain,
    rows: Array.from({ length: rng.int(24, 40) }, (_, i): IntersectionRow => {
      const base = rng.pick(spec.terms);
      const kw = `${rng.pick(spec.modifiers)} ${base} ${i}`.replace(/\s\d+$/, i < 12 ? "" : ` ${i}`).trim();
      return { keyword: kw, searchVolume: rng.int(80, 2500), difficulty: rng.int(10, 50), competitorRank: rng.int(1, 20), ourRank: null };
    }),
  }));
}

function makeOrganic(keywords: DemoKeyword[], rankSeries: DemoRankSeries[], rng: Rng): OrganicKeywordRow[] {
  return keywords.filter((_, i) => i % 2 === 0).map((k, i) => ({
    keyword: k.keyword, position: rankSeries[i * 2].points.at(-1) ?? null, searchVolume: k.volume, difficulty: k.difficulty,
    url: rankSeries[i * 2].url, estTraffic: Number((k.volume * rng.float(0.01, 0.2)).toFixed(1)),
  }));
}

function makeGscSnapshot(keywords: DemoKeyword[], rankSeries: DemoRankSeries[], gscDaily: DemoProjectData["gscDaily"], rng: Rng): DemoProjectData["gscSnapshot"] {
  const last28 = gscDaily.slice(-28);
  const totals: GscTotals = {
    clicks: last28.reduce((s, d) => s + d.clicks, 0), impressions: last28.reduce((s, d) => s + d.impressions, 0),
    ctr: Number((last28.reduce((s, d) => s + d.clicks, 0) / Math.max(1, last28.reduce((s, d) => s + d.impressions, 0))).toFixed(4)),
    position: Number((last28.reduce((s, d) => s + d.position, 0) / last28.length).toFixed(1)),
  };
  const topQueries: GscTopRow[] = keywords.slice(0, 25).map((k, i) => ({ key: k.keyword, clicks: rng.int(20, 400) + (25 - i) * 10, impressions: rng.int(500, 9000), ctr: Number(rng.float(0.01, 0.08).toFixed(4)), position: Number(rng.float(2, 18).toFixed(1)), page: rankSeries[i].url }));
  const topPages: GscTopRow[] = rankSeries.slice(0, 15).map((s, i) => ({ key: s.url, clicks: rng.int(30, 600) + (15 - i) * 15, impressions: rng.int(800, 12000), ctr: Number(rng.float(0.01, 0.08).toFixed(4)), position: Number(rng.float(2, 18).toFixed(1)) }));
  const risingQueries: RisingQuery[] = keywords.slice(25, 33).map((k, i) => { const prior = rng.int(5, 60); const recent = prior + rng.int(10, 80); return { query: k.keyword, recent, prior, delta: recent - prior, page: rankSeries[25 + i].url }; });
  return { totals, topQueries, topPages, risingQueries };
}

function makeGaSnapshot(spec: DemoProjectSpec, rankSeries: DemoRankSeries[], gaDaily: DemoProjectData["gaDaily"], rng: Rng): DemoProjectData["gaSnapshot"] {
  const totals: GaTotals = { sessions: gaDaily.slice(-28).reduce((s, d) => s + d.sessions, 0), users: Math.round(gaDaily.slice(-28).reduce((s, d) => s + d.users, 0) * 0.8), engagementRate: Number(rng.float(0.5, 0.7).toFixed(3)), conversions: rng.int(20, 200) };
  const channels: GaChannelRow[] = ([["Organic Search", 0.58], ["Direct", 0.2], ["Referral", 0.09], ["Social", 0.08], ["Email", 0.05]] as const).map(([channel, share]) => ({ channel, sessions: Math.round(totals.sessions * share) }));
  const topPages: GaPageRow[] = rankSeries.slice(0, 12).map((s) => ({ page: s.url.replace(`https://${spec.domain}`, ""), sessions: rng.int(50, 900), engagementRate: Number(rng.float(0.4, 0.8).toFixed(3)), conversions: rng.int(0, 25) }));
  return { totals, channels, topPages };
}

function makeAiScans(spec: DemoProjectSpec, now: Date, keywords: DemoKeyword[], rng: Rng): DemoProjectData["aiScans"] {
  const engines: PerEngine["engine"][] = ["perplexity", "chatgpt", "gemini"];
  const aiQueries = keywords.slice(0, 12).map((k, i) => ({ text: i < 8 ? `${k.keyword}` : `what is the best ${k.keyword}`, source: (i < 8 ? "gsc" : "generated") as "gsc" | "generated" }));
  return Array.from({ length: 8 }, (_, w) => {
    const lift = w / 8;
    const perQuery: PerQuery[] = aiQueries.map((q) => ({ text: q.text, source: q.source, named: rng.chance(0.25 + lift * 0.3), cited: rng.chance(0.15 + lift * 0.25) }));
    const perEngine: PerEngine[] = engines.map((engine) => ({ engine, answers: aiQueries.length, named: perQuery.filter(() => rng.chance(0.3 + lift * 0.3)).length, cited: perQuery.filter(() => rng.chance(0.2 + lift * 0.25)).length }));
    const named = perQuery.filter((q) => q.named).length, cited = perQuery.filter((q) => q.cited).length;
    const citedSources: CitedSource[] = [spec.domain, ...spec.competitors, "wikipedia.org", "reddit.com"].map((domain) => ({ domain, count: rng.int(1, 12), topUrl: `https://${domain}/${slug(spec.terms[0])}` }));
    return { at: daysAgo(now, (7 - w) * 7), queries: aiQueries, engines: perEngine, perQuery, namedTotal: named, citedTotal: cited, answersTotal: aiQueries.length * engines.length, citedSources };
  });
}

function makeUsage(spec: DemoProjectSpec, now: Date, rng: Rng): DemoProjectData["usage"] {
  const usage: DemoProjectData["usage"] = [];
  for (let i = DAYS - 1; i >= 0; i -= rng.int(2, 5)) {
    usage.push({ at: daysAgo(now, i), endpoint: "/v3/serp/google/organic/live/advanced", rows: spec.keywordCount, cost: Number((spec.keywordCount * 0.002).toFixed(3)) });
    if (i % 7 === 0) usage.push({ at: daysAgo(now, i), endpoint: "/v3/dataforseo_labs/google/domain_intersection/live", rows: spec.competitors.length, cost: Number((spec.competitors.length * 0.012).toFixed(3)) });
  }
  return usage;
}

export function generateProjectData(spec: DemoProjectSpec, now: Date, rng: Rng): DemoProjectData {
  const keywords = makeKeywords(spec, rng);
  const rankSeries = makeRankSeries(spec, keywords, rng);
  const competitorKeywords = makeCompetitorKeywords(spec, keywords, rng);
  const gaps = makeGaps(spec, rng);
  const organic = makeOrganic(keywords, rankSeries, rng);
  const { gsc: gscDaily, ga: gaDaily } = makeSeries(now, rng, spec.keywordCount, spec.keywordCount > 100 ? 0.35 : 0.1);
  const gscSnapshot = makeGscSnapshot(keywords, rankSeries, gscDaily, rng);
  const gaSnapshot = makeGaSnapshot(spec, rankSeries, gaDaily, rng);
  const aiScans = makeAiScans(spec, now, keywords, rng);
  const conversations = makeConversations(spec, now, rng);
  const usage = makeUsage(spec, now, rng);

  return {
    keywords, rankSeries, competitors: spec.competitors, competitorKeywords, gaps, organic,
    backlinkSnapshots: makeBacklinks(spec, now, rng), audit: makeAudit(spec, rng),
    gscDaily, gscSnapshot, gaDaily, gaSnapshot,
    aiScans, conversations, usage,
  };
}
