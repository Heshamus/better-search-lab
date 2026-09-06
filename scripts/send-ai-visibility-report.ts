// Manually send the AI-visibility report email for every project that has at
// least one scan (baseline if only one exists). Useful for verifying the email
// path without waiting for the weekly cron.
//   docker compose run --rm seo-worker pnpm exec tsx scripts/send-ai-visibility-report.ts
import { db } from "../src/db/client";
import { projects } from "../src/db/schema";
import { getScanHistory } from "../src/lib/ai-visibility/store";
import { buildWeeklyReport } from "../src/lib/ai-visibility/report";
import { getConfig } from "../src/lib/config/resolve";
import { makeEmailSender } from "../src/lib/config/clients";

const bare = (d: string): string => d.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");

async function main() {
  const cfg = await getConfig(db, { fresh: true });
  const email = makeEmailSender(cfg);
  const reportTo = cfg.email.reportTo;
  // Once, before the loop: the answer is the same for every project, and
  // repeating it per project buries the reports that were actually built.
  if (!email || !reportTo) console.log("email not configured — building reports without sending");
  const all = await db.select().from(projects);
  let sent = 0;
  for (const project of all) {
    const history = await getScanHistory(db, project.id, 2);
    if (!history.length) continue;
    const report = buildWeeklyReport({ domain: bare(project.domain), latest: history[0], previous: history[1] ?? null, appUrl: cfg.app.url });
    if (!email || !reportTo) {
      console.log(`${project.domain} → not sent :: subject="${report.subject}"`);
    } else {
      const res = await email.send({ to: reportTo, subject: report.subject, html: report.html, text: report.text });
      console.log(`${project.domain} → to=${reportTo} :: ${JSON.stringify(res)} :: subject="${report.subject}"`);
      if (res.sent) sent += 1;
    }
  }
  console.log(`done: ${sent} email(s) sent`);
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
