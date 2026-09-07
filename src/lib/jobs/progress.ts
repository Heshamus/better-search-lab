import { eq } from "drizzle-orm";
import { jobs } from "@/db/schema";

export type ProgressTarget = { id: string } | { dedupeKey: string };

export interface ProgressWriter {
  /** Record a progress line. Writes at most once per `minIntervalMs`; the latest message always wins. */
  progress: (message: string) => Promise<void>;
  /** Write the held message, if any. drainOnce/runJob call this after the handler settles. */
  flush: () => Promise<void>;
}

const DEFAULT_INTERVAL_MS = 1000;

/**
 * A throttled writer for `jobs.progress` (spec §11.2). Handlers report freely;
 * the DB sees one UPDATE per second at most, and the final line is always
 * flushed so the UI never ends on a stale "42 of 150".
 */
export function makeProgressWriter(
  db: any,
  target: ProgressTarget,
  opts: { minIntervalMs?: number; now?: () => number } = {},
): ProgressWriter {
  const minInterval = opts.minIntervalMs ?? DEFAULT_INTERVAL_MS;
  const now = opts.now ?? Date.now;
  const where = "id" in target ? eq(jobs.id, target.id) : eq(jobs.dedupeKey, target.dedupeKey);
  let lastWriteAt = -Infinity;
  let held: string | null = null;

  async function write(message: string): Promise<void> {
    held = null;
    lastWriteAt = now();
    try {
      await db.update(jobs).set({ progress: message }).where(where);
    } catch (e) {
      // Progress lines are best-effort telemetry, not job outcome. A write failure here
      // must never reject `progress()`/`flush()` — a handler that calls progress() inside
      // its own try/catch (e.g. profile-site's rankedKeywords guard) would misattribute
      // this as THAT call failing, and a handler that calls it outside any try (e.g.
      // rank-refresh's mapLimit callback) would have the whole job marked failed even
      // though the real work succeeded. Warn and move on.
      console.warn(`job progress write failed: ${String((e as { message?: unknown })?.message ?? e)}`);
    }
  }

  return {
    async progress(message) {
      if (now() - lastWriteAt >= minInterval) {
        await write(message);
      } else {
        held = message;
      }
    },
    async flush() {
      if (held !== null) await write(held);
    },
  };
}
