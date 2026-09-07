// Records the real /v3/dataforseo_labs/google/competitors_domain/live envelope
// for the fixture, target domain as argv[2]. Run once with real credentials in
// the environment:
//   set -a && . ./.env && set +a && pnpm exec tsx scripts/probe-competitors-domain.ts example.com > src/lib/dataforseo/fixtures/competitors-domain-live.json
// The raw output names real domains (the owner's target plus every competitor
// DataForSEO returns) — before committing, sanitize BY HAND: replace the
// owner's domain with `example-site.com` and every competitor domain with
// `rival-one.example` … `rival-ten.example`, keep the numeric fields as
// recorded, then confirm tests/repo/no-internal-references.test.ts still passes.
import { DataForSeoClient } from "../src/lib/dataforseo/client";

async function main() {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) {
    console.error("DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD must be set");
    process.exit(1);
  }
  const target = process.argv[2];
  if (!target) {
    console.error("usage: pnpm exec tsx scripts/probe-competitors-domain.ts <target-domain>");
    process.exit(1);
  }
  const client = new DataForSeoClient({ login, password });
  const resp = await client.post<any>("/v3/dataforseo_labs/google/competitors_domain/live", [
    { target, location_code: 2840, language_code: "en", limit: 10 },
  ]);
  process.stdout.write(JSON.stringify(resp, null, 2) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
