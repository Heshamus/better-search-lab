// Live E2E for the Reddit Conversations feature: run the REAL production scan
// (redditConversationsHandler → Apify + DeepSeek judge + Perplexity + DeepSeek
// draft → store) for the HarperFlow project, print what it surfaced, then build
// + send the actual digest email. Run in the deployed container:
//   docker compose run --rm -v /opt/seo-platform/app/scripts:/app/scripts seo-worker \
//     pnpm exec tsx scripts/verify-reddit-scan.ts
import { db } from "../src/db/client";
import { projects } from "../src/db/schema";
import { loadEnv } from "../src/config/env";
import { redditConversationsHandler } from "../src/lib/jobs/handlers/reddit-conversations";
import { listLatestConversations } from "../src/lib/reddit/conversations-store";
import { buildConversationsEmail } from "../src/lib/reddit/email";
import { sendEmail } from "../src/lib/email/resend";

const bare = (d: string): string => d.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");

async function main() {
  const env = loadEnv();
  const rows = await db.select().from(projects);
  const proj = rows.find((p) => /harperflow/i.test(p.domain)) ?? rows[0];
  if (!proj) { console.log("no project found"); process.exit(1); }
  console.log(`project: ${proj.id}  ${proj.domain}`);

  console.log("running the real scan (Apify + DeepSeek + Perplexity — this takes a couple minutes)...");
  const res = await redditConversationsHandler()({ db, projectId: proj.id });
  console.log(`scan result: ${JSON.stringify(res)}`);

  const stored = await listLatestConversations(db, proj.id, 5);
  console.log(`\n=== stored conversations: ${stored.length} ===`);
  for (const c of stored) {
    console.log(`\n  r/${c.subreddit}  ::  ${String(c.title).slice(0, 74)}`);
    console.log(`    upVotes=${c.upVotes}  numComments=${c.numComments}  promoRisk=${c.promoRisk}`);
    console.log(`    why: ${c.whyItMatters}`);
    console.log(`    citations: ${(c.citations || []).slice(0, 3).join("  |  ")}`);
    console.log(`    draft: ${String(c.draftReply || "(none)").replace(/\s+/g, " ").slice(0, 340)}`);
    console.log(`    ${c.threadUrl}`);
  }

  if (stored.length) {
    const email = buildConversationsEmail({ domain: bare(proj.domain), conversations: stored, appUrl: env.APP_URL });
    const sres = await sendEmail(
      {
        to: env.REPORT_EMAIL_TO ?? "hesham@betterbrainlab.org",
        from: env.REPORT_EMAIL_FROM ?? "Better Search Lab <reports@harperflow.io>",
        subject: email.subject,
        html: email.html,
        text: email.text,
      },
      { apiKey: env.RESEND_API_KEY },
    );
    console.log(`\nEMAIL "${email.subject}"  →  ${JSON.stringify(sres)}`);
  } else {
    console.log("\nno conversations stored → nothing to email");
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
