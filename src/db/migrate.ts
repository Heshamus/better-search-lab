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

const sql = postgres(loadEnv().DATABASE_URL, { max: 1 });
try {
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
} finally {
  await sql.end();
}
