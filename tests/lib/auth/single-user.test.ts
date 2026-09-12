import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { SINGLE_USER_ID, isSingleUserMode } from "@/lib/auth/single-user";
import { ensureSingleUserAdmin } from "@/lib/auth/session";
import { countUsers } from "@/lib/auth/users";

let close: (() => Promise<void>) | undefined;
afterEach(() => close?.());

describe("single-user mode", () => {
  it("isSingleUserMode reads BSL_SINGLE_USER and always yields to demo mode", () => {
    expect(isSingleUserMode({})).toBe(false);
    expect(isSingleUserMode({ BSL_SINGLE_USER: "1" })).toBe(true);
    expect(isSingleUserMode({ BSL_SINGLE_USER: "true" })).toBe(true);
    expect(isSingleUserMode({ BSL_SINGLE_USER: "yes" })).toBe(false);
    // Demo is always read-only and never bypasses auth — it wins.
    expect(isSingleUserMode({ BSL_SINGLE_USER: "1", DEMO_MODE: "1" })).toBe(false);
    expect(isSingleUserMode({ BSL_SINGLE_USER: "1", DEMO_MODE: "true" })).toBe(false);
  });

  it("ensureSingleUserAdmin provisions exactly one admin, idempotently", async () => {
    const t = await createTestDb();
    close = t.close;
    const a = await ensureSingleUserAdmin(t.db);
    expect(a.id).toBe(SINGLE_USER_ID);
    expect(a.role).toBe("admin");
    expect(await countUsers(t.db)).toBe(1);
    const again = await ensureSingleUserAdmin(t.db);
    expect(again.id).toBe(SINGLE_USER_ID);
    expect(await countUsers(t.db)).toBe(1); // no duplicate row
  });
});
