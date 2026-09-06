import { projects } from "@/db/schema";
import { getConnection } from "@/lib/google/store";
import { getLatestScan, getScanHistory } from "./store";
import { buildWeeklyReport } from "./report";
import type { EmailSender } from "@/lib/email/sender";

const WEEK_MS = 7 * 86_400_000;
const bareDomain = (d: string): string => d.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");

/**
 * Self-healing weekly AI-visibility pass, run from the daily worker tick: for
 * each Google-connected project not scanned in the last 7 days, run a scan
 * (injected) and email the week-over-week report. `enabled` is decided by the
 * caller from config (Eden AI connected). Fail-soft per project and
 * email-optional — the scan still builds the trend when no sender or no
 * recipient is configured; that is logged, never fabricated.
 */
export async function runWeeklyAiVisibility(deps: {
  db: any;
  now: Date;
  enabled: boolean;
  email: EmailSender | null;
  reportTo?: string;
  appUrl?: string;
  scan: (projectId: string) => Promise<void>;
}): Promise<{ scanned: string[]; emailed: string[] }> {
  const { db, now } = deps;
  const scanned: string[] = [];
  const emailed: string[] = [];
  if (!deps.enabled) return { scanned, emailed }; // feature off

  const all = await db.select().from(projects);
  for (const project of all) {
    const conn = await getConnection(db, project.id);
    if (!conn?.propertyUrl) continue; // needs Search Console queries to scan

    const latest = await getLatestScan(db, project.id);
    if (latest && now.getTime() - latest.scannedAt.getTime() < WEEK_MS) continue; // scanned recently

    try {
      await deps.scan(project.id);
      scanned.push(project.id);

      const history = await getScanHistory(db, project.id, 2);
      const newLatest = history[0];
      if (!newLatest) continue;
      if (!deps.email || !deps.reportTo) {
        console.warn("[weekly-ai-visibility] report not emailed for", project.id, "- email or recipient not configured");
        continue;
      }
      const report = buildWeeklyReport({ domain: bareDomain(project.domain), latest: newLatest, previous: history[1] ?? null, appUrl: deps.appUrl });
      const res = await deps.email.send({ to: deps.reportTo, subject: report.subject, html: report.html, text: report.text });
      if (res.sent) emailed.push(project.id);
      else console.warn("[weekly-ai-visibility] email not sent for", project.id, "-", res.reason);
    } catch (e) {
      console.error("[weekly-ai-visibility] failed for", project.id, e);
    }
  }
  return { scanned, emailed };
}
