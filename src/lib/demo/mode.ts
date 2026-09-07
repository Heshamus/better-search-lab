/**
 * `DEMO_MODE` as the bootstrap schema reads it (src/config/env.ts). Pure so
 * middleware (edge) can use it. The `[k: string]: string | undefined` index
 * signature alongside the named `DEMO_MODE` key keeps this from being a TS
 * "weak type" (a type with only named optional properties, checked against a
 * source with no matching named property) — without it, `= process.env` fails
 * to typecheck, since `NodeJS.ProcessEnv` carries no named `DEMO_MODE`
 * property, only its own index signature. Same reason `loadEnv` in
 * `src/config/env.ts` types its `= process.env` parameter as
 * `Record<string, string | undefined>` rather than a named-properties type.
 */
export function isDemoMode(env: { DEMO_MODE?: string; [k: string]: string | undefined } = process.env): boolean {
  return env.DEMO_MODE === "true" || env.DEMO_MODE === "1";
}
