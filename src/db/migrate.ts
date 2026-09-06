// One-shot migration runner: applies every SQL file in ./drizzle to DATABASE_URL.
// Run locally via `pnpm db:migrate`; the Docker web entrypoint runs it on boot
// (Plan 2). Idempotent: already-applied files are skipped.
//
// Not unit-tested (needs a live Postgres) — `tests/db/migrations-present.test.ts`
// covers the artifact this script depends on (that `drizzle/*.sql` exists).
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { loadEnv } from "@/config/env";

/**
 * Migration 0023 adds a case-insensitive unique index on users.email. On a
 * database that already holds "Bob@x.com" and "bob@x.com" it fails with a bare
 * Postgres 23505 naming an index nobody has heard of. Postgres errors also
 * arrive wrapped (`error.cause`) depending on the driver path, so both are
 * checked. Returns the operator-facing hint, or null when this is some other
 * failure that should surface unchanged.
 */
function duplicateEmailHint(e: unknown): string | null {
  const layers = [e, (e as { cause?: unknown })?.cause];
  const isDuplicateEmailIndex = layers.some((layer) => {
    const err = layer as { code?: unknown; message?: unknown; constraint_name?: unknown } | undefined;
    if (!err || err.code !== "23505") return false;
    return `${err.message ?? ""} ${err.constraint_name ?? ""}`.includes("users_email_lower_idx");
  });
  if (!isDuplicateEmailIndex) return null;
  return [
    "Migration 0023 needs case-insensitively unique emails. Find duplicates with:",
    "  SELECT lower(email), count(*) FROM users GROUP BY 1 HAVING count(*) > 1;",
    "then merge or rename them and re-run.",
  ].join("\n");
}

const sql = postgres(loadEnv().DATABASE_URL, { max: 1 });
let failed = false;
try {
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
} catch (e) {
  failed = true;
  console.error(e);
  const hint = duplicateEmailHint(e);
  if (hint) console.error("\n" + hint);
} finally {
  await sql.end();
}
// After the connection is closed, never inside the catch: process.exit() skips
// the finally block, which would leave the socket open on the way out.
if (failed) process.exit(1);
