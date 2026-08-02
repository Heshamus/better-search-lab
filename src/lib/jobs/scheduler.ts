export function registerSchedules(deps: {
  schedule: (cron: string, fn: () => void) => void; run: () => Promise<void>;
}) {
  // 03:00 daily — the worker decides per-project whether a run is due (daily vs weekly cadence)
  deps.schedule("0 3 * * *", () => {
    deps.run().catch((err) => console.error("[worker] scheduled run failed:", err));
  });
}
