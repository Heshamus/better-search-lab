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
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { isDemoMode } = await import("@/lib/demo/mode");
    if (isDemoMode()) {
      const { ensureDemoSeeded } = await import("@/lib/demo/boot");
      const { db } = await import("@/db/client");
      await ensureDemoSeeded(db);
    }
  }
}
