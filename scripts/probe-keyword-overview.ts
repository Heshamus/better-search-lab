// Airtight gate for the Keyword Overview feature: one real keyword_overview/live
// call to CONFIRM the response carries keyword_info.monthly_searches (the 12-month
// history) and its ordering, BEFORE the mapper is written to trust it.
//   set -a && . ./.env && set +a && pnpm exec tsx scripts/probe-keyword-overview.ts
// Writes a trimmed { tasks:[{ status_code, result:[{ items }] }] } fixture and
// prints a concise shape summary (no giant dump).
import { readFileSync, writeFileSync } from "node:fs";
import { db } from "../src/db/client";
import { getConfig } from "../src/lib/config/resolve";
import { makeDataForSeoClient, NOT_CONFIGURED } from "../src/lib/config/clients";

const FIXTURE = "src/lib/dataforseo/fixtures/keyword-overview-bulk-live.json";

// Minimal .env loader — takes everything after the first '=' as the value, so
// unquoted values containing spaces (e.g. an allowlist) don't break like `source`.
function loadDotenv(path = ".env") {
  let txt: string;
  try { txt = readFileSync(path, "utf8"); } catch { return; }
  for (const line of txt.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!(key in process.env)) process.env[key] = val;
  }
}

async function main() {
  loadDotenv();
  const client = makeDataForSeoClient(await getConfig(db, { fresh: true }));
  if (!client) { console.error(NOT_CONFIGURED.dataforseo); process.exit(1); }
  const resp = await client.post<any>("/v3/dataforseo_labs/google/keyword_overview/live", [
    { keywords: ["project management software", "notion alternative"], location_code: 2840, language_code: "en" },
  ]);

  const task = resp?.tasks?.[0];
  const items = task?.result?.[0]?.items ?? [];

  // Concise shape summary — this is what confirms the airtight gate.
  console.log("status_code:", task?.status_code, task?.status_message);
  console.log("items:", items.length);
  for (const i of items) {
    const info = i.keyword_info ?? {};
    const ms = info.monthly_searches ?? [];
    console.log(
      `\n  keyword="${i.keyword}"  vol=${info.search_volume}  kd=${i.keyword_properties?.keyword_difficulty}  cpc=${info.cpc}  comp=${info.competition}`,
    );
    console.log(`    monthly_searches: present=${Array.isArray(info.monthly_searches)} length=${ms.length}`);
    if (ms.length) {
      console.log(`    first: ${JSON.stringify(ms[0])}`);
      console.log(`    last:  ${JSON.stringify(ms[ms.length - 1])}`);
    }
  }

  // Trim to the shape the mapper/test consume. Carries BOTH the top-level envelope
  // status_code/status_message and the task-level ones — assertTasksOk requires
  // both, and a real DataForSEO success response always has both (an earlier probe
  // dropped the top-level pair, which produced a fixture assertTasksOk would reject).
  const trimmed = { status_code: resp?.status_code ?? 20000, status_message: resp?.status_message ?? "Ok.", tasks: [{ status_code: task?.status_code ?? 20000, status_message: task?.status_message ?? "Ok.", result: [{ items }] }] };

  // Emit the fixture JSON on stdout between markers — robust when running inside
  // a one-off container where a file write wouldn't survive.
  console.log("\nFIXTURE_JSON_BEGIN");
  console.log(JSON.stringify(trimmed, null, 2));
  console.log("FIXTURE_JSON_END");

  // Best-effort local write too (no-op-safe if the fs isn't writable).
  try {
    writeFileSync(FIXTURE, JSON.stringify(trimmed, null, 2) + "\n");
    console.log(`wrote ${FIXTURE} (${items.length} items)`);
  } catch (e) {
    console.log(`(did not write ${FIXTURE}: ${(e as Error).message})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
