import { projects } from "@/db/schema";
import { getConnection } from "@/lib/google/store";
import { getLatestScan, getScanHistory } from "./store";
import { buildWeeklyReport } from "./report";
import { sendEmail } from "@/lib/email/resend";

const WEEK_MS = 7 * 86_400_000;
const bareDomain = (d: string): string => d.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");

/**
 * Self-healing weekly AI-visibility pass, run from the daily worker tick: for
 * each Google-connected project not scanned in the last 7 days, run a scan
 * (injected) and email the week-over-week report. Fail-soft per project and
 * email-optional — the scan still builds the trend even when Resend is absent.
 */
export async function runWeeklyAiVisibility(deps: {
  db: any;
  now: Date;
  env: { EDENAI_API_KEY?: string; RESEND_API_KEY?: string; REPORT_EMAIL_TO?: string; REPORT_EMAIL_FROM?: string; APP_URL?: string };
  scan: (projectId: string) => Promise<void>;
  fetchImpl?: typeof fetch;
}): Promise<{ scanned: string[]; emailed: string[] }> {
  const { db, now, env } = deps;
  const scanned: string[] = [];
  const emailed: string[] = [];
  if (!env.EDENAI_API_KEY) return { scanned, emailed }; // feature off

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
      const report = buildWeeklyReport({ domain: bareDomain(project.domain), latest: newLatest, previous: history[1] ?? null, appUrl: env.APP_URL });
      const res = await sendEmail(
        {
          to: env.REPORT_EMAIL_TO ?? "hesham@betterbrainlab.org",
          from: env.REPORT_EMAIL_FROM ?? "Better Search Lab <reports@harperflow.io>",
          subject: report.subject,
          html: report.html,
          text: report.text,
        },
        { apiKey: env.RESEND_API_KEY, fetchImpl: deps.fetchImpl },
      );
      if (res.sent) emailed.push(project.id);
      else console.warn("[weekly-ai-visibility] email not sent for", project.id, "-", res.reason);
    } catch (e) {
      console.error("[weekly-ai-visibility] failed for", project.id, e);
    }
  }
  return { scanned, emailed };
}
