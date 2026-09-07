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
    await db.update(jobs).set({ progress: message }).where(where);
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
