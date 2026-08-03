// Standalone worker process (runs as a separate Railway "worker" service in production).
//
// Uses RELATIVE imports (not the `@/` tsconfig alias) on purpose: `tsx worker/index.ts` does
// not resolve tsconfig `paths` at runtime, so `@/...` imports would crash with
// "Cannot find module '@/...'" the moment this file is executed directly. The rest of the
// app (Next.js, Vitest via vite-tsconfig-paths) resolves `@/` fine — only this entrypoint
// needs to route around it.
import cron from "node-cron";
import { registerSchedules } from "../src/lib/jobs/scheduler";
import { db } from "../src/db/client";
import { runJob } from "../src/lib/jobs/runner";
import { healthHandler } from "../src/lib/jobs/handlers/health";
import { projects as projectsTable } from "../src/db/schema";
import { dueProjects } from "../src/lib/schedule";
import { rankRefreshHandler } from "../src/lib/jobs/handlers/rank-refresh";
import { metricsRefreshHandler } from "../src/lib/jobs/handlers/metrics-refresh";
import { DataForSeoClient } from "../src/lib/dataforseo/client";
import { loadEnv } from "../src/config/env";

async function run() {
  const today = new Date().toISOString().slice(0, 10);
  await runJob(db, { type: "health", date: today, handler: healthHandler });

  const env = loadEnv();
  const client = new DataForSeoClient({ login: env.DATAFORSEO_LOGIN, password: env.DATAFORSEO_PASSWORD });
  const allProjects = await db.select().from(projectsTable);
  const due = dueProjects(allProjects, today);
  for (const pid of due.rankRefresh) {
    await runJob(db, { type: "rank_refresh", projectId: pid, date: today, handler: rankRefreshHandler(client) });
  }
  for (const pid of due.metricsRefresh) {
    await runJob(db, { type: "keyword_metrics_refresh", projectId: pid, date: today, handler: metricsRefreshHandler(client) });
  }
}
registerSchedules({ schedule: (c, fn) => cron.schedule(c, fn), run });
console.log("[worker] schedules registered");
