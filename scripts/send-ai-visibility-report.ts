// Manually send the AI-visibility report email for every project that has at
// least one scan (baseline if only one exists). Useful for verifying the email
// path without waiting for the weekly cron.
//   docker compose run --rm seo-worker pnpm exec tsx scripts/send-ai-visibility-report.ts
import { db } from "../src/db/client";
import { projects } from "../src/db/schema";
import { getScanHistory } from "../src/lib/ai-visibility/store";
import { buildWeeklyReport } from "../src/lib/ai-visibility/report";
import { sendEmail } from "../src/lib/email/resend";
import { loadEnv } from "../src/config/env";

const bare = (d: string): string => d.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");

async function main() {
  const env = loadEnv();
  const all = await db.select().from(projects);
  let sent = 0;
  for (const project of all) {
    const history = await getScanHistory(db, project.id, 2);
    if (!history.length) continue;
    const report = buildWeeklyReport({ domain: bare(project.domain), latest: history[0], previous: history[1] ?? null, appUrl: env.APP_URL });
    const res = await sendEmail(
      {
        to: env.REPORT_EMAIL_TO ?? "hesham@betterbrainlab.org",
        from: env.REPORT_EMAIL_FROM ?? "Better Search Lab <reports@harperflow.io>",
        subject: report.subject,
        html: report.html,
        text: report.text,
      },
      { apiKey: env.RESEND_API_KEY },
    );
    console.log(`${project.domain} → to=${env.REPORT_EMAIL_TO ?? "hesham@betterbrainlab.org"} :: ${JSON.stringify(res)} :: subject="${report.subject}"`);
    if (res.sent) sent += 1;
  }
  console.log(`done: ${sent} email(s) sent`);
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
