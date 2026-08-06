// Airtight gate for the Reddit Conversations feature: one real Apify scrape to
// confirm the mapper's field names are right AND that engagement fields
// (upVotes / numComments) come back (i.e. we're in full-scrape mode, not the
// fast RSS mode that omits them). Run in the deployed container (real APIFY_API_KEY):
//   docker compose run --rm -v /opt/seo-platform/app/scripts:/app/scripts seo-worker \
//     pnpm exec tsx scripts/probe-apify-reddit.ts
import { scrapeReddit } from "../src/lib/reddit/apify";
import { loadEnv } from "../src/config/env";

async function main() {
  const env = loadEnv();
  if (!env.APIFY_API_KEY) { console.error("APIFY_API_KEY not set in env"); process.exit(1); }

  const posts = await scrapeReddit(
    { apiKey: env.APIFY_API_KEY, actor: env.APIFY_REDDIT_ACTOR },
    { searches: ["best seo audit tool"], subredditUrls: ["https://www.reddit.com/r/SEO/"], sort: "New", time: "week", maxItems: 8 },
  );

  console.log(`posts returned: ${posts.length}`);
  for (const p of posts.slice(0, 5)) {
    console.log(`\n  r/${p.subreddit}  ::  ${String(p.title).slice(0, 72)}`);
    console.log(`    upVotes=${p.upVotes}  numComments=${p.numComments}  createdAt=${p.createdAt}  bodyLen=${p.body.length}  topComments=${p.topComments.length}`);
    console.log(`    url=${p.url}`);
  }

  const engagementOk = posts.some((p) => p.upVotes != null || p.numComments != null);
  const datesOk = posts.some((p) => p.createdAt && !Number.isNaN(Date.parse(p.createdAt)));
  const urlsOk = posts.every((p) => /reddit\.com/.test(p.url));
  console.log(`\n=== GATE ===`);
  console.log(`engagement fields present: ${engagementOk}`);
  console.log(`valid createdAt dates: ${datesOk}`);
  console.log(`all urls look like reddit: ${urlsOk}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
