import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { writeSettings } from "@/lib/config/store";
import { deriveKey } from "@/lib/config/crypto";
import { readUpdateState } from "@/lib/lifecycle/state";
import { APP_VERSION } from "@/lib/lifecycle/version";

let close: () => Promise<void>;
afterEach(() => close?.());

// Same secret tests/setup/vitest-setup.ts falls back to for process.env.AUTH_SECRET,
// so writes here land under the same key getConfig derives via loadEnv().
const key = deriveKey("test_auth_secret_0123456789_abcdefghijklmnop");

describe("readUpdateState", () => {
  it("is not available with nothing stored, and the first-run card is still pending", async () => {
    const t = await createTestDb();
    close = t.close;

    const state = await readUpdateState(t.db);

    expect(state).toEqual({
      current: APP_VERSION,
      latest: null,
      url: null,
      available: false,
      bannerDismissed: false,
      firstRunPending: true,
    });
  });

  it("is available once a strictly newer version is stored", async () => {
    const t = await createTestDb();
    close = t.close;
    await writeSettings(
      t.db,
      key,
      {
        "updates.latestVersion": "9.9.9",
        "updates.latestUrl": "https://gitlab.com/betterbrainlab/better-search-lab/-/releases/v9.9.9",
      },
      null,
    );

    const state = await readUpdateState(t.db);

    expect(state.available).toBe(true);
    expect(state.latest).toBe("9.9.9");
    expect(state.url).toBe("https://gitlab.com/betterbrainlab/better-search-lab/-/releases/v9.9.9");
    expect(state.bannerDismissed).toBe(false);
  });

  it("is not available when the stored latest is not newer than the running version", async () => {
    const t = await createTestDb();
    close = t.close;
    await writeSettings(t.db, key, { "updates.latestVersion": APP_VERSION }, null);

    const state = await readUpdateState(t.db);

    expect(state.available).toBe(false);
  });

  it("is dismissed once dismissedVersion matches the stored latest", async () => {
    const t = await createTestDb();
    close = t.close;
    await writeSettings(t.db, key, { "updates.latestVersion": "9.9.9", "updates.dismissedVersion": "9.9.9" }, null);

    const state = await readUpdateState(t.db);

    expect(state.available).toBe(true);
    expect(state.bannerDismissed).toBe(true);
  });

  it("stays undismissed when the dismissed version is stale against a newer latest", async () => {
    const t = await createTestDb();
    close = t.close;
    await writeSettings(t.db, key, { "updates.latestVersion": "9.9.9", "updates.dismissedVersion": "9.9.8" }, null);

    const state = await readUpdateState(t.db);

    expect(state.bannerDismissed).toBe(false);
  });

  it("clears firstRunPending once firstRunDismissedAt is recorded", async () => {
    const t = await createTestDb();
    close = t.close;
    await writeSettings(t.db, key, { "updates.firstRunDismissedAt": new Date().toISOString() }, null);

    const state = await readUpdateState(t.db);

    expect(state.firstRunPending).toBe(false);
  });
});
