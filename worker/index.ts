// Standalone worker process (runs as the seo-worker container / a separate Railway "worker" service).
//
// Uses RELATIVE imports (not the `@/` tsconfig alias) on purpose: `tsx worker/index.ts` does
// not resolve tsconfig `paths` at runtime, so `@/...` imports would crash with
// "Cannot find module '@/...'" the moment this file is executed directly. The rest of the
// app (Next.js, Vitest via vite-tsconfig-paths) resolves `@/` fine — only this entrypoint
// needs to route around it.
//
// Two responsibilities: (1) run scheduled jobs on a cron (registerSchedules), and (2) drain
// the on-demand job QUEUE — the pending jobs that HTTP routes enqueue instead of running
// inline (which timed out at the auth proxy). See src/lib/jobs/queue.ts.
import cron from "node-cron";
import { registerSchedules } from "../src/lib/jobs/scheduler";
import { db } from "../src/db/client";
import { runJob } from "../src/lib/jobs/runner";
import { drainOnce, reapStuckJobs, type JobHandler } from "../src/lib/jobs/queue";
import { healthHandler } from "../src/lib/jobs/handlers/health";
import { projects as projectsTable } from "../src/db/schema";
import { dueProjects } from "../src/lib/schedule";
import { rankRefreshHandler } from "../src/lib/jobs/handlers/rank-refresh";
import { metricsRefreshHandler } from "../src/lib/jobs/handlers/metrics-refresh";
import { gapRefreshHandler } from "../src/lib/jobs/handlers/gap-refresh";
import { weeklyOpportunitiesHandler } from "../src/lib/jobs/handlers/weekly-opportunities";
import { competitorIntelHandler } from "../src/lib/jobs/handlers/competitor-intel";
import { profileSiteHandler } from "../src/lib/jobs/handlers/profile-site";
import { siteAuditHandler } from "../src/lib/jobs/handlers/site-audit";
import { backlinksRefreshHandler } from "../src/lib/jobs/handlers/backlinks-refresh";
import { gscSyncHandler } from "../src/lib/jobs/handlers/gsc-sync";
import { gaSyncHandler } from "../src/lib/jobs/handlers/ga-sync";
import { aiVisibilityScanHandler } from "../src/lib/jobs/handlers/ai-visibility-scan";
import { runWeeklyAiVisibility } from "../src/lib/ai-visibility/weekly";
// reddit_radar_scan / redditRadarHandler stay registered below: the live Trends
// page's "Run Reddit Radar" button still enqueues this job type (its UI cutover
// is a separate, later step) — only the self-healing DAILY pass is superseded.
import { redditRadarHandler } from "../src/lib/jobs/handlers/reddit-radar";
import { redditConversationsHandler } from "../src/lib/jobs/handlers/reddit-conversations";
import { runDailyConversationRadar } from "../src/lib/reddit/daily-conversations";
import { scrapeReddit } from "../src/lib/reddit/apify";
import { fetchSite } from "../src/lib/crawl/fetch-site";
import { EdenClient } from "../src/lib/ai-visibility/engines";
import { DataForSeoClient } from "../src/lib/dataforseo/client";
import { DeepSeekClient } from "../src/lib/llm/deepseek";
import { loadEnv } from "../src/config/env";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Plain-text summary of a project's own site, for seeding its Reddit knowledge
// & voice brief (ensureKnowledgeBrief's `crawl` dep). fetchSite already strips
// to HTML per page; this collapses that HTML to bounded plain text — a local
// helper rather than deepseek.ts's stripTags, which is private to that module.
function htmlToText(pages: { html: string }[]): string {
  return pages
    .map((p) => p.html)
    .join(" ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 3000);
}

// Clients built once at module scope — shared by the cron run() and the queue drain.
const env = loadEnv();
const client = new DataForSeoClient({ login: env.DATAFORSEO_LOGIN, password: env.DATAFORSEO_PASSWORD });
const llm = env.DEEPSEEK_API_KEY ? new DeepSeekClient({ apiKey: env.DEEPSEEK_API_KEY }) : null;

// Composite refresh: the "Refresh data" button enqueues ONE job that runs
// rankings → gaps → opportunities in order (opportunities reads the fresh gaps).
function refreshAllHandler(): JobHandler {
  const rank = rankRefreshHandler(client);
  const gaps = gapRefreshHandler(client);
  const opps = weeklyOpportunitiesHandler();
  return async (ctx) => {
    const a = await rank(ctx);
    const b = await gaps(ctx);
    const c = await opps(ctx);
    return { rows: a.rows + b.rows + c.rows, cost: a.cost + b.cost + c.cost };
  };
}

// Maps an enqueued job's `type` to the handler that runs it. Any type not listed
// here is failed with a clear "no handler" error by drainOnce.
function resolveHandler(type: string): JobHandler | null {
  switch (type) {
    case "profile_site": return profileSiteHandler(client, { llm });
    case "rank_refresh": return rankRefreshHandler(client);
    case "gap_refresh": return gapRefreshHandler(client);
    case "weekly_opportunities": return weeklyOpportunitiesHandler();
    case "competitor_intel": return competitorIntelHandler(client);
    case "site_audit": return siteAuditHandler();
    case "backlinks_refresh": return backlinksRefreshHandler(client);
    case "gsc_sync": return gscSyncHandler();
    case "ga_sync": return gaSyncHandler();
    case "ai_visibility_scan": return aiVisibilityScanHandler();
    case "reddit_radar_scan": return redditRadarHandler();
    case "reddit_conversations_scan": return redditConversationsHandler();
    case "refresh_all": return refreshAllHandler();
    default: return null;
  }
}

async function run() {
  const today = new Date().toISOString().slice(0, 10);
  await runJob(db, { type: "health", date: today, handler: healthHandler });

  const allProjects = await db.select().from(projectsTable);
  const due = dueProjects(allProjects, today);
  for (const pid of due.rankRefresh) {
    await runJob(db, { type: "rank_refresh", projectId: pid, date: today, handler: rankRefreshHandler(client) });
  }
  for (const pid of due.metricsRefresh) {
    await runJob(db, { type: "keyword_metrics_refresh", projectId: pid, date: today, handler: metricsRefreshHandler(client) });
  }
  // Must run BEFORE weekly_opportunities: fresh competitor_gaps rows need to exist
  // this same tick so the shortlist's gap detector has signals to read.
  for (const pid of due.gaps) {
    await runJob(db, { type: "gap_refresh", projectId: pid, date: today, handler: gapRefreshHandler(client) });
  }
  for (const pid of due.opportunities) {
    await runJob(db, { type: "weekly_opportunities", projectId: pid, date: today, handler: weeklyOpportunitiesHandler() });
  }

  // Self-healing weekly AI-visibility: scan Google-connected projects not scanned
  // in 7 days and email the week-over-week report (email is best-effort).
  await runWeeklyAiVisibility({
    db,
    now: new Date(),
    env,
    scan: (pid) => runJob(db, { type: "ai_visibility_scan", projectId: pid, date: today, handler: aiVisibilityScanHandler() }).then(() => undefined),
  }).catch((e) => console.error("[worker] weekly ai-visibility pass failed:", e));

  // Self-healing daily Reddit "conversations worth joining" pass (Apify gather →
  // prefilter → DeepSeek fit+edge judge → Perplexity+DeepSeek draft → store →
  // email digest). Supersedes the old SerpApi radar's daily auto-scan; the old
  // on-demand reddit_radar_scan job type stays registered above for the
  // still-live Trends page button until its UI is cut over separately.
  await runDailyConversationRadar({
    db,
    now: new Date(),
    env,
    scrape: (i) => scrapeReddit({ apiKey: env.APIFY_API_KEY!, actor: env.APIFY_REDDIT_ACTOR }, i),
    ask: env.EDENAI_API_KEY ? (m, p) => new EdenClient(env.EDENAI_API_KEY!).ask(m, p) : undefined,
    chat: (msgs) => new DeepSeekClient({ apiKey: env.DEEPSEEK_API_KEY! }).chat(msgs),
    crawl: async (domain) => {
      const r = await fetchSite("https://" + domain);
      if (r.failed) return "";
      return htmlToText(r.pages);
    },
  }).catch((e) => console.error("[worker] daily reddit conversations pass failed:", e));
}

// Drain the on-demand queue continuously: run one job to completion, immediately
// look for the next; when the queue is empty, reap any stalled job and idle 2s.
// Single-consumer (one job at a time) — a slow job briefly delays the next, which
// for this single-tenant tool is fine and also paces external API usage.
async function queueLoop() {
  for (;;) {
    try {
      const outcome = await drainOnce(db, resolveHandler);
      if (outcome === "empty") {
        await reapStuckJobs(db);
        await sleep(2000);
      }
    } catch (e) {
      console.error("[worker] queue drain error:", e);
      await sleep(2000);
    }
  }
}

registerSchedules({ schedule: (c, fn) => cron.schedule(c, fn), run });
console.log("[worker] schedules registered");
void queueLoop();
console.log("[worker] queue drain started");
