/**
 * Next.js boot hook: in demo mode, seed once before the first request (spec §13).
 *
 * `register()` is invoked once per runtime this app uses — nodejs AND edge
 * (this app has edge middleware, so both bundles exist). The Node-only work
 * below (the DB client, bcrypt-backed seeder) must never reach the edge
 * bundle: webpack inlines `process.env.NEXT_RUNTIME` per compiler target and
 * dead-code-eliminates an `if (constant) { … }` BLOCK during parsing, before
 * it resolves any `import()` inside it — so the edge build never even tries
 * to resolve `postgres`/`node:crypto`. An early-return guard (`if (cond)
 * return;` followed by unconditional-looking code) does NOT get this
 * treatment — that needs full control-flow analysis, which happens too late
 * to save a `next build` that fails while resolving Node built-ins for edge.
 * Keep this nested inside the `if` block, not hoisted out of it.
 *
 * `ensureDemoSeeded` already never throws (it catches its own errors), but
 * the try/catch below makes the WHOLE hook throw-proof by construction —
 * including the dynamic imports themselves, which could in principle fail
 * to resolve. A caught failure is recorded through the same status path
 * (`recordDemoSeedFailure`), so /login still shows an honest seedError
 * instead of the server crashing at boot.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { isDemoMode } = await import("@/lib/demo/mode");
      if (isDemoMode()) {
        const { ensureDemoSeeded } = await import("@/lib/demo/boot");
        const { db } = await import("@/db/client");
        await ensureDemoSeeded(db);
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      try {
        const { recordDemoSeedFailure } = await import("@/lib/demo/boot");
        recordDemoSeedFailure(error);
      } catch {
        // Even the recovery import failed — nothing more we can do; the
        // server still boots, /login just won't have a specific reason.
        console.error(`[demo] boot hook failed: ${error}`);
      }
    }
  }
}
