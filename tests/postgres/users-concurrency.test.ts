import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "@/db/schema";
import { AdminAlreadyExistsError, LastAdminError, createFirstAdmin, createUser, updateUserRole, listUsers } from "@/lib/auth/users";
import { deriveKey } from "@/lib/config/crypto";
import { readAllSettings, writeSettings } from "@/lib/config/store";

// Runs only against a real Postgres: TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5433/bsl_test
// CI provides a service container on 5432 (the test job in .gitlab-ci.yml); the
// 5433 above matches tests/postgres/README.md's throwaway container, which maps
// off 5432 so it cannot collide with a Postgres you already run locally.
const url = process.env.TEST_DATABASE_URL;
const PW = "correct horse battery";
const key = deriveKey("test_auth_secret_0123456789_abcdefghijklmnop");

describe.skipIf(!url)("concurrency against real Postgres", () => {
  const conn = () => postgres(url!, { max: 1 });
  let sqlA: ReturnType<typeof postgres>;
  let sqlB: ReturnType<typeof postgres>;
  let dbA: ReturnType<typeof drizzle<typeof schema>>;
  let dbB: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    sqlA = conn();
    sqlB = conn();
    dbA = drizzle(sqlA, { schema });
    dbB = drizzle(sqlB, { schema });
    await migrate(dbA, { migrationsFolder: "./drizzle" });
  });
  beforeEach(async () => {
    await sqlA`truncate table settings, users cascade`;
  });
  afterAll(async () => {
    await sqlA.end();
    await sqlB.end();
  });

  it("two racing first-admin requests yield exactly one admin", async () => {
    const results = await Promise.allSettled([
      createFirstAdmin(dbA, { email: "a@example.com", password: PW }),
      createFirstAdmin(dbB, { email: "b@example.com", password: PW }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0].reason).toBeInstanceOf(AdminAlreadyExistsError);
    const users = await listUsers(dbA);
    expect(users.filter((u) => u.role === "admin")).toHaveLength(1);
  });

  it("two admins demoting each other concurrently leave at least one admin", async () => {
    const a = await createFirstAdmin(dbA, { email: "a@example.com", password: PW });
    const b = await createUser(dbA, { email: "b@example.com", password: PW, role: "admin" });
    const results = await Promise.allSettled([updateUserRole(dbA, a.id, "member"), updateUserRole(dbB, b.id, "member")]);
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    // Exactly one, not "at least one": both succeeding locks everyone out, and
    // both failing means the row lock is too coarse to be usable.
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(LastAdminError);
    const admins = (await listUsers(dbA)).filter((u) => u.role === "admin");
    expect(admins).toHaveLength(1);
  });

  it("concurrent writes to one setting end with one whole value, never a torn one", async () => {
    await Promise.all([
      writeSettings(dbA, key, { "llm.model": "model-from-a" }, null),
      writeSettings(dbB, key, { "llm.model": "model-from-b" }, null),
    ]);
    // One row, not two: the upsert must collapse the race onto the primary key
    // rather than leaving a duplicate whose winner depends on read order.
    const rows = (await readAllSettings(dbA, key)).filter((r) => r.key === "llm.model");
    expect(rows).toHaveLength(1);
    expect(["model-from-a", "model-from-b"]).toContain(rows[0]?.value);
  });
});
