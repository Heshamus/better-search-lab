// One-shot migration runner: applies every SQL file in ./drizzle to DATABASE_URL.
// Run locally via `pnpm db:migrate`; run once against each environment (fresh
// Supabase project, Railway deploy) after `DATABASE_URL` is set there — see README.
//
// Not unit-tested (needs a live Postgres) — `tests/db/migrations-present.test.ts`
// covers the artifact this script depends on (that `drizzle/*.sql` exists).
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { loadEnv } from "@/config/env";

const sql = postgres(loadEnv().DATABASE_URL, { max: 1 });
await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
await sql.end();
