import { isDemoMode } from "@/lib/demo/mode";

// The built-in admin auto-provisioned when BSL_SINGLE_USER is on
// (see ensureSingleUserAdmin in session.ts). A fixed UUID so the row — and the
// one FK to it, settings.updated_by — is stable across restarts.
export const SINGLE_USER_ID = "00000000-0000-0000-0000-000000000001";
export const SINGLE_USER_EMAIL = "single-user@localhost";

/**
 * Edge-safe reader for the opt-in single-user / no-auth mode. True only when
 * BSL_SINGLE_USER is set AND we are not in demo mode — demo is always
 * read-only and never bypasses authentication. Pure, so middleware (edge) can
 * call it; mirrors isDemoMode().
 */
export function isSingleUserMode(
  env: { BSL_SINGLE_USER?: string; DEMO_MODE?: string; [k: string]: string | undefined } = process.env,
): boolean {
  if (isDemoMode(env)) return false;
  return env.BSL_SINGLE_USER === "true" || env.BSL_SINGLE_USER === "1";
}
