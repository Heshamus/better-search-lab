import { describe, it, expect, vi } from "vitest";
import { registerSchedules } from "@/lib/jobs/scheduler";

describe("registerSchedules", () => {
  it("registers a cron entry that invokes run()", () => {
    const schedule = vi.fn();
    const run = vi.fn().mockResolvedValue(undefined);
    registerSchedules({ schedule, run });
    expect(schedule).toHaveBeenCalledWith(expect.any(String), expect.any(Function));
    // invoke the registered callback
    schedule.mock.calls[0][1]();
    expect(run).toHaveBeenCalled();
  });

  it("a failing run is caught, not propagated (worker can't crash)", async () => {
    const schedule = vi.fn();
    const run = vi.fn().mockRejectedValue(new Error("db down"));
    registerSchedules({ schedule, run });
    const cb = schedule.mock.calls[0][1] as () => void;
    expect(() => cb()).not.toThrow();
    await Promise.resolve(); // let the rejection settle — no unhandled rejection
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("a rejected run never surfaces as a Node unhandledRejection", async () => {
    // Two things had to be verified empirically to make this assertion meaningful:
    // (1) `vi.fn().mockRejectedValue(...)` internally attaches its own handler to the
    //     returned promise (to record `mock.results`), which itself counts as "handling"
    //     the rejection and would mask a real regression — so `run` here is a plain
    //     rejecting function, not a vi.fn mock, ensuring Node's own unhandledRejection
    //     detection is the actual signal under test.
    // (2) Node dispatches "unhandledRejection" after the microtask queue drains, which is
    //     NOT reliably observable after a single `await Promise.resolve()` tick (or even
    //     `setTimeout(fn, 0)` under Vitest's runtime) — 50ms of margin is what reliably
    //     surfaced it against the pre-fix `void deps.run()` implementation.
    const onUnhandledRejection = vi.fn();
    process.on("unhandledRejection", onUnhandledRejection);
    try {
      const schedule = vi.fn();
      let runCalls = 0;
      const run = () => { runCalls++; return Promise.reject(new Error("db down")); };
      registerSchedules({ schedule, run });
      const cb = schedule.mock.calls[0][1] as () => void;
      cb();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(onUnhandledRejection).not.toHaveBeenCalled();
      expect(runCalls).toBe(1);
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }
  });
});
