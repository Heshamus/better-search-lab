// Standalone worker process (the seo-worker container / a separate Railway "worker" service).
//
// Two responsibilities: (1) run scheduled jobs on a cron (registerSchedules), and (2) drain
// the on-demand job QUEUE that HTTP routes enqueue (src/lib/jobs/queue.ts).
//
// Every job resolves its clients from a FRESH config read at its start (spec §8.4): this
// process cannot see the web process's cache invalidation, so a key saved in Settings must
// be re-read here, not cached. That is what makes "takes effect on the next job" true.
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
import { organicKeywordsRefreshHandler } from "../src/lib/jobs/handlers/organic-keywords-refresh";
import { gscSyncHandler } from "../src/lib/jobs/handlers/gsc-sync";
import { gaSyncHandler } from "../src/lib/jobs/handlers/ga-sync";
import { aiVisibilityScanHandler } from "../src/lib/jobs/handlers/ai-visibility-scan";
import { runWeeklyAiVisibility } from "../src/lib/ai-visibility/weekly";
import { redditConversationsHandler } from "../src/lib/jobs/handlers/reddit-conversations";
import { runDailyConversationRadar } from "../src/lib/reddit/daily-conversations";
import { makeConversationScrape } from "../src/lib/reddit/scrape-source";
import { fetchSite } from "../src/lib/crawl/fetch-site";
import { getConfig } from "../src/lib/config/resolve";
import { conversationFetchEnv, makeChatProvider, makeDataForSeoClient, makeEdenClient, makeEmailSender, NOT_CONFIGURED } from "../src/lib/config/clients";
import type { AppConfig } from "../src/lib/config/app-config";
import type { DataForSeoClient } from "../src/lib/dataforseo/client";
import { loadEnv } from "../src/config/env";

loadEnv(); // fail fast on a bad bootstrap env
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Plain-text summary of a project's own site, for seeding its Reddit knowledge & voice brief.
function htmlToText(pages: { html: string }[]): string {
  return pages.map((p) => p.html).join(" ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 3000);
}

const freshConfig = (): Promise<AppConfig> => getConfig(db, { fresh: true });

/** Wrap a DataForSEO-backed handler so it resolves the client from fresh config at run time. */
function withDataForSeo(build: (client: DataForSeoClient, cfg: AppConfig) => JobHandler): JobHandler {
  return async (ctx) => {
    const cfg = await freshConfig();
    const client = makeDataForSeoClient(cfg);
    if (!client) throw new Error(NOT_CONFIGURED.dataforseo);
    return build(client, cfg)(ctx);
  };
}

// Composite refresh: ONE job that runs rankings → gaps → opportunities in order.
function refreshAllHandler(): JobHandler {
  return withDataForSeo((client) => async (ctx) => {
    const a = await rankRefreshHandler(client)(ctx);
    const b = await gapRefreshHandler(client)(ctx);
    const c = await weeklyOpportunitiesHandler()(ctx);
    return { rows: a.rows + b.rows + c.rows, cost: a.cost + b.cost + c.cost };
  });
}

function resolveHandler(type: string): JobHandler | null {
  switch (type) {
    case "profile_site": return withDataForSeo((client, cfg) => profileSiteHandler(client, { llm: makeChatProvider(cfg) }));
    case "rank_refresh": return withDataForSeo((client) => rankRefreshHandler(client));
    case "gap_refresh": return withDataForSeo((client) => gapRefreshHandler(client));
    case "weekly_opportunities": return weeklyOpportunitiesHandler();
    case "competitor_intel": return withDataForSeo((client) => competitorIntelHandler(client));
    case "site_audit": return siteAuditHandler();
    case "backlinks_refresh": return withDataForSeo((client) => backlinksRefreshHandler(client));
    case "organic_keywords_refresh": return withDataForSeo((client) => organicKeywordsRefreshHandler(client));
    case "gsc_sync": return gscSyncHandler();
    case "ga_sync": return gaSyncHandler();
    case "ai_visibility_scan": return aiVisibilityScanHandler();
    case "reddit_conversations_scan": return redditConversationsHandler();
    case "refresh_all": return refreshAllHandler();
    default: return null;
  }
}

async function run() {
  const today = new Date().toISOString().slice(0, 10);
  await runJob(db, { type: "health", date: today, handler: healthHandler });

  const cfg = await freshConfig(); // once per tick
  const client = makeDataForSeoClient(cfg);
  const allProjects = await db.select().from(projectsTable);
  const due = dueProjects(allProjects, today);

  if (!client) {
    console.warn("[worker]", NOT_CONFIGURED.dataforseo, "— skipping scheduled refreshes this tick");
  } else {
    for (const pid of due.rankRefresh) {
      await runJob(db, { type: "rank_refresh", projectId: pid, date: today, handler: rankRefreshHandler(client) });
    }
    for (const pid of due.metricsRefresh) {
      await runJob(db, { type: "keyword_metrics_refresh", projectId: pid, date: today, handler: metricsRefreshHandler(client) });
    }
    // Must run BEFORE weekly_opportunities: fresh competitor_gaps rows need to exist this tick.
    for (const pid of due.gaps) {
      await runJob(db, { type: "gap_refresh", projectId: pid, date: today, handler: gapRefreshHandler(client) });
    }
    for (const pid of due.opportunities) {
      await runJob(db, { type: "weekly_opportunities", projectId: pid, date: today, handler: weeklyOpportunitiesHandler() });
    }
  }

  const email = makeEmailSender(cfg);

  await runWeeklyAiVisibility({
    db,
    now: new Date(),
    enabled: cfg.edenai.configured,
    email,
    reportTo: cfg.email.reportTo,
    appUrl: cfg.app.url,
    scan: (pid) => runJob(db, { type: "ai_visibility_scan", projectId: pid, date: today, handler: aiVisibilityScanHandler() }).then(() => undefined),
  }).catch((e) => console.error("[worker] weekly ai-visibility pass failed:", e));

  const chat = makeChatProvider(cfg);
  const eden = makeEdenClient(cfg);
  await runDailyConversationRadar({
    db,
    now: new Date(),
    enabled: !!chat && (cfg.reddit.configured || cfg.apify.configured),
    email,
    reportTo: cfg.email.reportTo,
    appUrl: cfg.app.url,
    scrape: makeConversationScrape(conversationFetchEnv(cfg)),
    ask: eden ? (m, p) => eden.ask(m, p) : undefined,
    chat: (msgs) => (chat ? chat.chat(msgs) : Promise.reject(new Error(NOT_CONFIGURED.llm))),
    crawl: async (domain) => {
      const r = await fetchSite("https://" + domain);
      if (r.failed) return "";
      return htmlToText(r.pages);
    },
  }).catch((e) => console.error("[worker] daily reddit conversations pass failed:", e));
}

// Drain the on-demand queue continuously (single consumer; see queue.ts).
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
