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
});
