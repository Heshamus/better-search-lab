import { describe, it, expect, afterEach, vi } from "vitest";
import { checkForUpdate } from "@/lib/lifecycle/check";
import { getConfig } from "@/lib/config/resolve";
import { writeSettings } from "@/lib/config/store";
import { deriveKey } from "@/lib/config/crypto";
import { createTestDb } from "@/db/test-db";

let close: () => Promise<void>;
afterEach(() => close?.());

// Same secret tests/setup/vitest-setup.ts falls back to for process.env.AUTH_SECRET,
// so writes here land under the same key checkForUpdate derives via loadEnv().
const key = deriveKey("test_auth_secret_0123456789_abcdefghijklmnop");

const ok = (version: string) =>
  new Response(
    JSON.stringify({
      tag_name: `v${version}`,
      _links: { self: `https://gitlab.com/betterbrainlab/better-search-lab/-/releases/v${version}` },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

describe("checkForUpdate", () => {
  it("writes latestVersion/latestUrl/checkedAt when the check succeeds and is enabled (default on)", async () => {
    const t = await createTestDb();
    close = t.close;
    const fetchImpl = vi.fn().mockResolvedValue(ok("1.2.0"));

    await checkForUpdate(t.db, { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const cfg = await getConfig(t.db, { fresh: true });
    expect(cfg.updates.latestVersion).toBe("1.2.0");
    expect(cfg.updates.latestUrl).toBe("https://gitlab.com/betterbrainlab/better-search-lab/-/releases/v1.2.0");
    expect(cfg.updates.checkedAt).toBeTruthy();
  });

  it("no-ops when checkEnabled is false: no fetch call, no write", async () => {
    const t = await createTestDb();
    close = t.close;
    await writeSettings(t.db, key, { "updates.checkEnabled": "false" }, null);
    const fetchImpl = vi.fn();

    await checkForUpdate(t.db, { fetchImpl });

    expect(fetchImpl).not.toHaveBeenCalled();
    const cfg = await getConfig(t.db, { fresh: true });
    expect(cfg.updates.latestVersion).toBeFalsy();
  });

  it("is fail-soft: a failed fetch neither throws nor clobbers prior state", async () => {
    const t = await createTestDb();
    close = t.close;
    await writeSettings(t.db, key, { "updates.latestVersion": "1.1.0" }, null);
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));

    await expect(checkForUpdate(t.db, { fetchImpl })).resolves.toBeUndefined();

    const cfg = await getConfig(t.db, { fresh: true });
    expect(cfg.updates.latestVersion).toBe("1.1.0");
  });
});
