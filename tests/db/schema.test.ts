import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { projects, users } from "@/db/schema";
import { sql } from "drizzle-orm";

let close: () => Promise<void>;
afterEach(() => close?.());

describe("schema", () => {
  it("inserts and reads a project row", async () => {
    const t = await createTestDb(); close = t.close;
    const [row] = await t.db.insert(projects).values({
      name: "HarperFlow", domain: "harperflow.io",
    }).returning();
    expect(row.domain).toBe("harperflow.io");
    expect(row.refreshCadence).toBe("weekly"); // default
  });
});

describe("users schema", () => {
  it("defaults session_version to 1 and last_login_at to null", async () => {
    const t = await createTestDb(); close = t.close;
    const [u] = await t.db.insert(users).values({ email: "a@example.com", passwordHash: "x" }).returning();
    expect(u.sessionVersion).toBe(1);
    expect(u.lastLoginAt).toBeNull();
    expect(u.role).toBe("member");
  });
  it("rejects a case-variant duplicate email", async () => {
    const t = await createTestDb(); close = t.close;
    await t.db.insert(users).values({ email: "Dup@Example.com", passwordHash: "x" });
    // Drizzle wraps the driver error: the Postgres text and SQLSTATE live on `cause`.
    await expect(t.db.insert(users).values({ email: "dup@example.com", passwordHash: "x" })).rejects.toSatisfy((e: any) => {
      const text = String(e?.cause?.message ?? e?.message ?? "");
      return e?.cause?.code === "23505" || /unique|duplicate/i.test(text);
    });
    const [{ n }] = await t.db.execute(sql`select count(*)::int as n from users`).then((r: any) => r.rows ?? r);
    expect(n).toBe(1);
  });
});
