// Live verification of the Keyword Overview pipeline: runs the EXACT production
// functions the route uses (keywordOverviewBulk -> buildKeywordCsv) against real
// DataForSEO, inside the deployed container (real creds via env). Proves real
// volume + 12-month history + trend + a real CSV, end to end.
//   docker compose run --rm -v /opt/seo-platform/app/scripts:/app/scripts seo-worker \
//     pnpm exec tsx scripts/verify-keyword-overview.ts
import { keywordOverviewBulk } from "../src/lib/dataforseo/labs";
import { buildKeywordCsv } from "../src/lib/keyword-csv";
import { db } from "../src/db/client";
import { getConfig } from "../src/lib/config/resolve";
import { makeDataForSeoClient, NOT_CONFIGURED } from "../src/lib/config/clients";

async function main() {
  const client = makeDataForSeoClient(await getConfig(db, { fresh: true }));
  if (!client) { console.error(NOT_CONFIGURED.dataforseo); process.exit(1); }
  const keywords = ["project management software", "notion alternative", "best crm", "time tracking app", "asana vs monday"];

  const { rows, rowsBilled } = await keywordOverviewBulk(client, { keywords, locationCode: 2840, languageCode: "en" });
  console.log(`rowsBilled=${rowsBilled}  rows=${rows.length}\n`);
  for (const r of rows) {
    const newest = r.monthly[r.monthly.length - 1];
    console.log(
      `  ${r.keyword}  vol=${r.searchVolume}  kd=${r.difficulty}  cpc=${r.cpc}  comp=${r.competition}  trend=${r.trendPct}  months=${r.monthly.length}  newest=${JSON.stringify(newest)}`,
    );
  }

  const csv = buildKeywordCsv(rows);
  const lines = csv.split("\r\n");
  console.log(`\nCSV: ${lines.length} lines, ${lines[0].split(",").length} columns`);
  console.log("HEADER: " + lines[0]);
  console.log("ROW1:   " + lines[1]);
  console.log("ROW2:   " + lines[2]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
