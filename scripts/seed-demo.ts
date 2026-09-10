// Seeds the demo dataset into the database at DATABASE_URL and exits.
//
// Used to generate `scripts/demo-seed.sql` (a snapshot of the fully-seeded
// read-only demo) that the Hugging Face demo image restores at boot instead of
// re-running the expensive seed on every cold start. Requires DEMO_MODE=true,
// the migrated schema, and the demo AUTH_SECRET — the seed encrypts settings
// with a key derived from AUTH_SECRET, so whatever restores the dump must use
// the same secret. Regenerate the dump with `docs/… ` — see the header of
// scripts/demo-seed.sql.
import { db } from "@/db/client";
import { ensureDemoSeeded, getDemoSeedStatus } from "@/lib/demo/boot";

async function main(): Promise<void> {
  await ensureDemoSeeded(db);
  const status = getDemoSeedStatus();
  if (!status?.ok) {
    console.error("[seed-demo] failed:", status?.error ?? "unknown");
    process.exit(1);
  }
  console.log("[seed-demo] ok");
  process.exit(0);
}

void main();
