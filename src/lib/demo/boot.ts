import { DEMO_ADMIN, seedDemo } from "./seed";
import { findUserByEmail } from "@/lib/auth/users";

export interface DemoSeedStatus { ok: boolean; error?: string; at: string }

// Kept on globalThis: Next bundles instrumentation.ts separately from pages, so
// a module-level variable would not be the same object in both.
const KEY = "__bslDemoSeedStatus";
const store = globalThis as unknown as Record<string, DemoSeedStatus | undefined>;

export function getDemoSeedStatus(): DemoSeedStatus | null { return store[KEY] ?? null; }
export function resetDemoSeedStatus(): void { delete store[KEY]; }

/** Boot-time seeding (spec §13): never throws — a failure is recorded and shown on /login. */
export async function ensureDemoSeeded(db: any): Promise<void> {
  try {
    if (!(await findUserByEmail(db, DEMO_ADMIN.email))) {
      console.log("[demo] seeding the demo dataset…");
      await seedDemo(db);
      console.log("[demo] seeded");
    }
    store[KEY] = { ok: true, at: new Date().toISOString() };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    // Lost a race with a concurrent boot (two instances/workers starting at
    // once) that seeded first between our check above and seedDemo's own —
    // the dataset exists either way, so this is a success, not a failure.
    if (error === "demo already seeded") {
      store[KEY] = { ok: true, at: new Date().toISOString() };
      return;
    }
    console.error(`[demo] seeding failed: ${error}`);
    store[KEY] = { ok: false, error, at: new Date().toISOString() };
  }
}
