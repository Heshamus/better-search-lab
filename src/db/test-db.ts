import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { pushSchema } from "drizzle-kit/api"; // if unavailable, run migrations from ./drizzle
import * as schema from "./schema";

export async function createTestDb() {
  const pg = new PGlite();
  const db = drizzle(pg, { schema });
  const { apply } = await pushSchema(schema, db as any); // create tables from schema
  await apply();
  return { db, close: () => pg.close() };
}
