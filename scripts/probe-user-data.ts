// Records the real /v3/appendix/user_data envelope for the fixture, with the
// login redacted. Run once with real credentials in the environment:
//   set -a && . ./.env && set +a && pnpm exec tsx scripts/probe-user-data.ts > src/lib/dataforseo/fixtures/user-data.json
import { DataForSeoClient } from "../src/lib/dataforseo/client";
import { USER_DATA_ENDPOINT } from "../src/lib/dataforseo/appendix";

async function main() {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) {
    console.error("DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD must be set");
    process.exit(1);
  }
  const client = new DataForSeoClient({ login, password });
  const resp = await client.get<any>(USER_DATA_ENDPOINT);
  for (const task of resp?.tasks ?? []) {
    for (const result of task?.result ?? []) {
      if (result && typeof result === "object") {
        result.login = "owner@example.com";
        delete result.price; // large, account-specific, irrelevant to the parser
      }
    }
  }
  process.stdout.write(JSON.stringify(resp, null, 2) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
