import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// requireApiToken (src/lib/api-guard.ts) needs a REAL, working db — unlike
// keyword-overview-route.test.ts's `db: {}` stub, its consumer
// (validateApiToken) issues real SQL against it. @/lib/api-tokens is
// deliberately left UNmocked here: a vi.mock swaps a module for the whole
// file, not per call site, so mocking validateApiToken would also replace
// the real implementations the "api-tokens" describe block below depends on.
// The pglite instance this factory builds is never explicitly closed — it's
// in-memory WASM with no external handle, and the process exits once the
// run finishes.
vi.mock("@/db/client", async () => {
  const { createTestDb } = await import("@/db/test-db");
  const t = await createTestDb();
  return { db: t.db };
});

import { createTestDb } from "@/db/test-db";
import { apiTokens } from "@/db/schema";
import { db as guardDb } from "@/db/client"; // the pglite instance from the mock above
import { requireApiToken } from "@/lib/api-guard";
import {
  createApiToken,
  hashToken,
  listApiTokens,
  revokeApiToken,
  validateApiToken,
} from "@/lib/api-tokens";

describe("api-tokens", () => {
  // Scoped to THIS describe block only — an afterEach at file scope would
  // also fire after the requireApiToken tests below (which never touch
  // `close`), re-closing the last api-tokens test's already-closed PGlite
  // instance and throwing "PGlite is closed".
  let close: (() => Promise<void>) | undefined;
  afterEach(() => close?.());

  it("createApiToken returns a bsl_-prefixed plaintext token; the DB row stores only its sha256 hash", async () => {
    const t = await createTestDb();
    close = t.close;

    const token = await createApiToken(t.db, "ci token");
    expect(token.startsWith("bsl_")).toBe(true);

    const [row] = await t.db.select().from(apiTokens);
    expect(row.tokenHash).toBe(hashToken(token));
    expect(row.tokenHash).not.toBe(token); // plaintext is never persisted
    expect(row.label).toBe("ci token");
  });

  it("createApiToken accepts a null label", async () => {
    const t = await createTestDb();
    close = t.close;

    await createApiToken(t.db, null);
    const [row] = await t.db.select().from(apiTokens);
    expect(row.label).toBeNull();
  });

  it("validateApiToken is true for a just-created token and records lastUsedAt", async () => {
    const t = await createTestDb();
    close = t.close;

    const token = await createApiToken(t.db, "used token");
    const [before] = await t.db.select().from(apiTokens);
    expect(before.lastUsedAt).toBeNull();

    expect(await validateApiToken(t.db, token)).toBe(true);

    const [after] = await t.db.select().from(apiTokens);
    expect(after.lastUsedAt).toBeInstanceOf(Date);
  });

  it("validateApiToken is false for a bogus token", async () => {
    const t = await createTestDb();
    close = t.close;

    expect(await validateApiToken(t.db, "bsl_this-was-never-issued")).toBe(false);
  });

  it("revokeApiToken deletes the row; validateApiToken then returns false", async () => {
    const t = await createTestDb();
    close = t.close;

    const token = await createApiToken(t.db, "to revoke");
    const [row] = await t.db.select().from(apiTokens);
    expect(await validateApiToken(t.db, token)).toBe(true); // sanity: valid before revoke

    await revokeApiToken(t.db, row.id);

    expect(await validateApiToken(t.db, token)).toBe(false);
  });

  it("listApiTokens returns metadata for every row and never the hash", async () => {
    const t = await createTestDb();
    close = t.close;

    await createApiToken(t.db, "a");
    await createApiToken(t.db, null);

    const list = await listApiTokens(t.db);
    expect(list).toHaveLength(2);
    for (const row of list) {
      expect(Object.keys(row).sort()).toEqual(["createdAt", "id", "label", "lastUsedAt"]);
    }
    expect(list.some((r) => r.label === "a")).toBe(true);
    expect(list.some((r) => r.label === null)).toBe(true);
  });
});

describe("requireApiToken", () => {
  let validToken: string;
  beforeAll(async () => {
    validToken = await createApiToken(guardDb, "guard test token");
  });

  it("401s when the Authorization header is missing", async () => {
    const res = await requireApiToken(new Request("http://x"));
    expect(res?.status).toBe(401);
  });

  it("returns null for a valid bearer token", async () => {
    const res = await requireApiToken(
      new Request("http://x", { headers: { authorization: `Bearer ${validToken}` } }),
    );
    expect(res).toBeNull();
  });

  it("accepts a case-insensitive scheme ('bearer')", async () => {
    const res = await requireApiToken(
      new Request("http://x", { headers: { authorization: `bearer ${validToken}` } }),
    );
    expect(res).toBeNull();
  });

  it("401s for a well-formed but unissued token", async () => {
    const res = await requireApiToken(
      new Request("http://x", { headers: { authorization: "Bearer bsl_not-a-real-token" } }),
    );
    expect(res?.status).toBe(401);
  });

  it("401s for a malformed header (wrong scheme, or missing token after Bearer)", async () => {
    const basic = await requireApiToken(new Request("http://x", { headers: { authorization: "Basic abc123" } }));
    expect(basic?.status).toBe(401);
    const bare = await requireApiToken(new Request("http://x", { headers: { authorization: "Bearer" } }));
    expect(bare?.status).toBe(401);
  });
});
