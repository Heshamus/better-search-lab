import { describe, it, expect, vi } from "vitest";
import { maybeReloadForStaleBuild } from "@/lib/stale-build-reload";

function fakeStorage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => void m.set(k, v),
  };
}

const run = (message: string | null | undefined, now: number, storage = fakeStorage()) => {
  const reload = vi.fn();
  const did = maybeReloadForStaleBuild(message, { now, storage, reload });
  return { did, reload, storage };
};

describe("maybeReloadForStaleBuild", () => {
  it("ignores unrelated errors", () => {
    const { did, reload } = run("TypeError: x is not a function", 1000);
    expect(did).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads once on the stale-build server-action error and records the timestamp", () => {
    const { did, reload, storage } = run("An unexpected response was received from the server.", 5000);
    expect(did).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(storage.getItem("__stale_build_reload_at")).toBe("5000");
  });

  it("also matches the 'Failed to find Server Action' deployment-skew variant", () => {
    const msg = 'Failed to find Server Action "abc". This request might be from an older or newer deployment.';
    const { did, reload } = run(msg, 5000);
    expect(did).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does NOT reload again within the cooldown (loop guard)", () => {
    const storage = fakeStorage({ __stale_build_reload_at: "5000" });
    const { did, reload } = run("An unexpected response was received from the server.", 8000, storage);
    expect(did).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads again once the cooldown has elapsed", () => {
    const storage = fakeStorage({ __stale_build_reload_at: "5000" });
    const { did, reload } = run("An unexpected response was received from the server.", 25000, storage);
    expect(did).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("ignores empty/nullish messages", () => {
    expect(run(undefined, 1000).did).toBe(false);
    expect(run(null, 1000).did).toBe(false);
    expect(run("", 1000).did).toBe(false);
  });
});
