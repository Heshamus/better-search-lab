/**
 * `DEMO_MODE` as the bootstrap schema reads it (src/config/env.ts). Pure so
 * middleware (edge) can use it. `Record<string, string | undefined>` (not
 * `{ DEMO_MODE?: string }`) matches `loadEnv`'s own parameter below — TS's weak-type
 * check otherwise rejects `process.env` as the default, since `NodeJS.ProcessEnv`
 * carries no named `DEMO_MODE` property, only its index signature.
 */
export function isDemoMode(env: Record<string, string | undefined> = process.env): boolean {
  return env.DEMO_MODE === "true" || env.DEMO_MODE === "1";
}
