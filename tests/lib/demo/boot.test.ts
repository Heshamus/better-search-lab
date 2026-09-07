import { describe, it, expect, afterEach, vi } from "vitest";
import { createTestDb } from "@/db/test-db";

vi.mock("@/lib/demo/seed", async () => {
  const actual = await vi.importActual<typeof import("@/lib/demo/seed")>("@/lib/demo/seed");
  return { ...actual, seedDemo: vi.fn(actual.seedDemo) };
});

import { seedDemo, DEMO_ADMIN } from "@/lib/demo/seed";
import { ensureDemoSeeded, getDemoSeedStatus, resetDemoSeedStatus } from "@/lib/demo/boot";
import { createFirstAdmin, findUserByEmail } from "@/lib/auth/users";

let close: () => Promise<void>;
afterEach(async () => { await close?.(); resetDemoSeedStatus(); vi.mocked(seedDemo).mockClear(); });

describe("ensureDemoSeeded", () => {
  it("skips when the demo admin already exists", async () => {
    const t = await createTestDb(); close = t.close;
    await createFirstAdmin(t.db, DEMO_ADMIN);
    await ensureDemoSeeded(t.db);
    expect(seedDemo).not.toHaveBeenCalled();
    expect(getDemoSeedStatus()).toMatchObject({ ok: true });
  });
  it("records a failure instead of throwing", async () => {
    const t = await createTestDb(); close = t.close;
    vi.mocked(seedDemo).mockRejectedValueOnce(new Error("disk full"));
    await expect(ensureDemoSeeded(t.db)).resolves.toBeUndefined();
    expect(getDemoSeedStatus()).toMatchObject({ ok: false, error: "disk full" });
  });
  it("actually seeds a fresh database and records success", async () => {
    const t = await createTestDb(); close = t.close;
    await ensureDemoSeeded(t.db);
    expect(seedDemo).toHaveBeenCalledTimes(1);
    expect(await findUserByEmail(t.db, DEMO_ADMIN.email)).toMatchObject({ role: "admin" });
    expect(getDemoSeedStatus()).toMatchObject({ ok: true });
  }, 180_000);
  it("treats seedDemo's \"demo already seeded\" throw as success, not a failure", async () => {
    const t = await createTestDb(); close = t.close;
    vi.mocked(seedDemo).mockRejectedValueOnce(new Error("demo already seeded"));
    await expect(ensureDemoSeeded(t.db)).resolves.toBeUndefined();
    expect(getDemoSeedStatus()).toMatchObject({ ok: true });
  });
});
