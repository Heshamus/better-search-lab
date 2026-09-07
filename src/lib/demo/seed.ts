import { aiVisibilitySnapshots, apiTokens, apiUsage, backlinkSnapshots, jobs, keywordMetrics, rankSnapshots } from "@/db/schema";
import { loadEnv } from "@/config/env";
import { mulberry32 } from "./prng";
import { DEMO_ADMIN, DEMO_MCP_TOKEN } from "./public";
import { DEMO_PROJECTS, generateProjectData, type DemoProjectData, type DemoProjectSpec } from "./generators";
import { createFirstAdmin, findUserByEmail, type UserSummary } from "@/lib/auth/users";
import { hashToken } from "@/lib/api-tokens";
import { createProject } from "@/lib/projects";
import { COMPLETE_ONBOARDING } from "@/lib/setup/onboarding";
import { addCompetitor, saveGapRows } from "@/lib/competitors";
import { saveCompetitorKeywords } from "@/lib/competitor-intel";
import { addKeywords } from "@/lib/keywords";
import { replaceOrganicKeywords } from "@/lib/organic-keywords-store";
import { saveAudit } from "@/lib/audit/store";
import { upsertConnection, replaceGscDaily, saveGscSnapshot, replaceGaDaily, saveGaSnapshot } from "@/lib/google/store";
import { saveConversations } from "@/lib/reddit/conversations-store";
import { saveRedditConfig } from "@/lib/reddit/reddit-config";
import { assembleOpportunities } from "@/lib/core/opportunity-engine";
import { loadDetectorInput, mondayOf, upsertOpportunities } from "@/lib/opportunities";
import { writeSettings } from "@/lib/config/store";
import { keyFromEnv } from "@/lib/config/crypto";

// The demo dataset (spec §13). Everything below is written through the SAME
// store functions the real jobs use, so the demo exercises the real code paths
// rather than a parallel one. Raw inserts appear in exactly three situations:
//  - the store stamps its own "now" and the demo needs a backdated row —
//    `saveBacklinks`, `saveScan` and `logApiUsage` would otherwise collapse 12
//    weeks of backlink history, 8 weekly AI scans and 90 days of spend onto a
//    single instant;
//  - there is no store — `rank_snapshots`, `keyword_metrics` and `jobs` are
//    written directly by their own job handlers too;
//  - the store cannot express the value — `createApiToken` mints a RANDOM
//    token, and the demo's token is a fixed, documented one.

// Defined in ./public so the client components that show them (the login form,
// the demo MCP panel) can import them without pulling this module in; re-exported
// here because the seeder and its callers have always read them from `./seed`.
export { DEMO_ADMIN, DEMO_MCP_TOKEN };

const DAY_MS = 86_400_000;
/** Postgres caps a statement at 65535 bound parameters; 90 days × 140 keywords is far past that. */
const CHUNK = 500;

async function insertChunked(db: any, table: any, rows: unknown[]): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) await db.insert(table).values(rows.slice(i, i + CHUNK));
}

/** The generated keywords are unique, so every one gets a row — say so loudly rather than inserting a null keyword_id. */
function keywordIdFor(ids: Map<string, string>, keyword: string): string {
  const id = ids.get(keyword);
  if (!id) throw new Error(`demo seed: no keyword row was created for "${keyword}"`);
  return id;
}

/** The one seeded admin plus the fixed read-only MCP token (hashed exactly as the token store hashes it). */
async function seedAdminAndToken(db: any): Promise<UserSummary> {
  const admin = await createFirstAdmin(db, DEMO_ADMIN);
  await db.insert(apiTokens).values({ tokenHash: hashToken(DEMO_MCP_TOKEN), label: "Demo" });
  return admin;
}

/**
 * Tracked keywords, their metrics, and 90 days of daily rank history.
 * `rankSeries[].points` carry no dates of their own — the last point is `now`
 * and each earlier one is one day back, the same grid the GSC/GA series use.
 */
async function seedKeywordsAndRanks(db: any, projectId: string, data: DemoProjectData, now: Date): Promise<void> {
  const inserted: { id: string; keyword: string }[] = await addKeywords(
    db,
    projectId,
    data.keywords.map((k) => ({ keyword: k.keyword, locationCode: 2840, languageCode: "en" })),
  );
  const idByKeyword = new Map(inserted.map((r) => [r.keyword, r.id]));

  await insertChunked(db, keywordMetrics, data.keywords.map((k) => ({
    keywordId: keywordIdFor(idByKeyword, k.keyword),
    searchVolume: k.volume, cpc: k.cpc, competition: k.competition, difficulty: k.difficulty,
    updatedAt: now,
  })));

  const snapshots: unknown[] = [];
  for (const s of data.rankSeries) {
    const keywordId = keywordIdFor(idByKeyword, s.keyword);
    s.points.forEach((rank, i) => {
      const capturedAt = new Date(now.getTime() - (s.points.length - 1 - i) * DAY_MS);
      snapshots.push(rank === null
        ? { keywordId, capturedAt, rankAbsolute: null, rankGroup: null, url: null, serpFeatures: ["people_also_ask"], ownedFeatures: [], fetchStatus: "ok", ownUrls: [] }
        : { keywordId, capturedAt, rankAbsolute: rank, rankGroup: rank, url: s.url, serpFeatures: rank <= 10 ? ["people_also_ask", "featured_snippet"] : ["people_also_ask"], ownedFeatures: rank <= 3 ? ["featured_snippet"] : [], fetchStatus: "ok", ownUrls: [s.url] });
    });
  }
  await insertChunked(db, rankSnapshots, snapshots);
}

/** The competitor roster, what each one ranks for, and the gap rows the detectors read. */
async function seedCompetitors(db: any, projectId: string, data: DemoProjectData): Promise<void> {
  for (const domain of data.competitors) await addCompetitor(db, projectId, domain);
  for (const ck of data.competitorKeywords) await saveCompetitorKeywords(db, projectId, ck.domain, ck.rows);
  for (const g of data.gaps) await saveGapRows(db, projectId, g.domain, g.rows);
}

/** Twelve weekly backlink snapshots. Raw: `saveBacklinks` stamps createdAt = now, which would flatten the trend. */
async function seedBacklinks(db: any, projectId: string, data: DemoProjectData): Promise<void> {
  await insertChunked(db, backlinkSnapshots, data.backlinkSnapshots.map((b) => ({
    projectId, createdAt: b.at, summary: b.summary, referringDomains: b.referringDomains, anchors: b.anchors,
  })));
}

/**
 * Google: a connection row so the pages read as connected, then the 90-day
 * series and the latest snapshot for each of Search Console and Analytics.
 * The engine's first-party signals (`buildFirstPartyInput`) come from these.
 */
async function seedGoogle(db: any, projectId: string, spec: DemoProjectSpec, data: DemoProjectData): Promise<void> {
  await upsertConnection(db, projectId, {
    refreshToken: "demo-refresh-token",
    propertyUrl: `sc-domain:${spec.domain}`,
    gaPropertyId: String(300000000 + (spec.seed % 1000)),
  });
  await replaceGscDaily(db, projectId, data.gscDaily);
  await saveGscSnapshot(db, projectId, data.gscSnapshot);
  await replaceGaDaily(db, projectId, data.gaDaily);
  await saveGaSnapshot(db, projectId, data.gaSnapshot);
}

/**
 * Eight weekly AI-visibility scans. Raw: `saveScan` stamps scannedAt = now, so
 * the whole history would land on one instant. The generator's `engines` is
 * the column name (`saveScan` calls the same field `perEngine` on its input).
 */
async function seedAiVisibility(db: any, projectId: string, data: DemoProjectData): Promise<void> {
  await insertChunked(db, aiVisibilitySnapshots, data.aiScans.map((s) => ({
    projectId, scannedAt: s.at, queries: s.queries, engines: s.engines, perQuery: s.perQuery,
    namedTotal: s.namedTotal, citedTotal: s.citedTotal, answersTotal: s.answersTotal, citedSources: s.citedSources,
  })));
}

/** The Reddit brief/subreddits, then one saveConversations call per scan date — exactly how the real scan writes. */
async function seedReddit(db: any, projectId: string, spec: DemoProjectSpec, data: DemoProjectData): Promise<void> {
  await saveRedditConfig(db, projectId, { knowledgeBrief: spec.knowledgeBrief, subreddits: spec.subreddits });
  for (const c of data.conversations) await saveConversations(db, projectId, c.scanDate, c.rows);
}

/** The spend meter. Raw: `logApiUsage` has no occurredAt parameter, so every row would be dated today. */
async function seedUsage(db: any, projectId: string, data: DemoProjectData): Promise<void> {
  await insertChunked(db, apiUsage, data.usage.map((u) => ({
    occurredAt: u.at, projectId, endpoint: u.endpoint, rows: u.rows, estCost: String(u.cost),
  })));
}

/** A few finished jobs so the job history and the project's "last run" reads are not empty. */
async function seedJobs(db: any, projectId: string, spec: DemoProjectSpec, now: Date): Promise<void> {
  await db.insert(jobs).values(["rank_refresh", "gap_refresh", "weekly_opportunities", "site_audit"].map((type, i) => {
    const startedAt = new Date(now.getTime() - (i + 1) * 3_600_000);
    return {
      type, projectId, dedupeKey: `${type}:${projectId}:demo`, status: "done",
      scheduledFor: startedAt, startedAt, finishedAt: new Date(startedAt.getTime() + 90_000),
      rowsConsumed: type === "rank_refresh" ? spec.keywordCount : 0,
      estCost: type === "rank_refresh" ? String(spec.keywordCount * 0.002) : "0",
    };
  }));
}

/** The real engine over the generated signals, stored under this ISO week's Monday. */
async function runEngine(db: any, projectId: string, now: Date): Promise<void> {
  const input = await loadDetectorInput(db, projectId, now);
  const results = assembleOpportunities(input, { topN: 25 });
  await upsertOpportunities(db, projectId, mondayOf(now.toISOString().slice(0, 10)), results);
}

/**
 * Seed the two demo projects (spec §13): one admin, one read-only MCP token,
 * both projects with every dataset the pages read, and the real opportunity
 * engine run over the result. Dates are anchored to `now`; every value is
 * deterministic per seed, so two seeds of the same `now` are identical.
 *
 * Throws `demo already seeded` rather than doubling the dataset when the
 * database has been seeded before — the boot path calls this unconditionally.
 */
export async function seedDemo(db: any, opts: { now?: Date } = {}): Promise<{ projectIds: string[] }> {
  const now = opts.now ?? new Date();
  if (await findUserByEmail(db, DEMO_ADMIN.email)) throw new Error("demo already seeded");
  const admin = await seedAdminAndToken(db);

  const projectIds: string[] = [];
  for (const spec of DEMO_PROJECTS) {
    const data = generateProjectData(spec, now, mulberry32(spec.seed));
    // COMPLETE_ONBOARDING: a demo must never open on the setup wizard.
    const project = await createProject(db, { name: spec.name, domain: spec.domain, onboarding: COMPLETE_ONBOARDING });
    projectIds.push(project.id);

    await seedKeywordsAndRanks(db, project.id, data, now);
    await seedCompetitors(db, project.id, data);
    await replaceOrganicKeywords(db, project.id, data.organic);
    await seedBacklinks(db, project.id, data);
    await saveAudit(db, project.id, data.audit);
    await seedGoogle(db, project.id, spec, data);
    await seedAiVisibility(db, project.id, data);
    await seedReddit(db, project.id, spec, data);
    await seedUsage(db, project.id, data);
    await seedJobs(db, project.id, spec, now);
    await runEngine(db, project.id, now);
  }

  // The wizard is complete for a demo, and its AI step reads as skipped — so
  // nothing routes to /setup and Settings shows the demo as configured.
  await writeSettings(db, keyFromEnv(loadEnv()), { "setup.llmStep": "skipped", "setup.completedAt": now.toISOString() }, admin.id);
  return { projectIds };
}
