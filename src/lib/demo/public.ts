/**
 * The demo's two published credentials (spec §13), in one place. Deliberately
 * free of server imports — the login form is a client component, so pulling
 * these from `./seed` would drag the whole seeder (db client, every store, the
 * generators) into the browser bundle and repeating the literals there is how
 * they drift apart. `./seed` re-exports both, so server-side importers are
 * unaffected.
 */
export const DEMO_ADMIN = { email: "demo@example.com", password: "demo-password" } as const;

/** Fixed, documented, read-only token: every /api/mcp/* route is read-only and the data is synthetic. */
export const DEMO_MCP_TOKEN = "bsl_demo_readonly";
