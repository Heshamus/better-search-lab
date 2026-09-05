import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { loadEnv } from "@/config/env";

export type Db = PostgresJsDatabase<typeof schema>;

let instance: Db | null = null;

/**
 * The real client, created on first use — never at import time. `next build`
 * imports every page (all of which import `db`) with no DATABASE_URL, and unit
 * tests import modules that import `db` without ever touching a database; both
 * must succeed. postgres-js itself is lazy (no socket until the first query),
 * so the only thing deferred here is reading the env.
 */
export function getDb(): Db {
  if (!instance) {
    const sql = postgres(loadEnv().DATABASE_URL, { max: 5 });
    instance = drizzle(sql, { schema });
  }
  return instance;
}

/**
 * Lazy facade with the drizzle client's surface. Every property access forwards
 * to the real instance, creating it on the first one, so `import { db }` keeps
 * working unchanged across the codebase.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<PropertyKey, unknown>;
    const value = real[prop];
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(real) : value;
  },
});
