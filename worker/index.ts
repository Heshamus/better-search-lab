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

async function run() {
  const today = new Date().toISOString().slice(0, 10);
  await runJob(db, { type: "health", date: today, handler: healthHandler });
  // Phase 1 adds rank_refresh / weekly_opportunities here.
}
registerSchedules({ schedule: (c, fn) => cron.schedule(c, fn), run });
console.log("[worker] schedules registered");
