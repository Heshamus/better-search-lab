// Next.js Server Actions carry a build-specific action ID. After a redeploy, a
// browser still holding the previous build submits an action ID the new server
// doesn't recognise, and the client throws "An unexpected response was received
// from the server." (or "Failed to find Server Action ..."). Left alone, that
// surfaces as the scary full-page "Application error" boundary.
//
// This turns that one specific, recoverable error into a single silent reload
// that pulls the current build. Pure + injectable (now/storage/reload) so the
// loop-guard is unit-testable without a browser.

const STALE_BUILD_ERROR = /unexpected response was received from the server|failed to find server action/i;
const RELOAD_AT_KEY = "__stale_build_reload_at";
const COOLDOWN_MS = 15_000;

/**
 * If `message` is the stale-build Server Action error AND we haven't already
 * reloaded within the cooldown, record the attempt and reload. Returns whether
 * a reload was triggered. The cooldown is the loop guard: if the fresh build is
 * broken for some *other* reason, we reload at most once, then let the error
 * surface instead of reload-storming.
 */
export function maybeReloadForStaleBuild(
  message: string | null | undefined,
  opts: { now: number; storage: Pick<Storage, "getItem" | "setItem">; reload: () => void },
): boolean {
  if (!message || !STALE_BUILD_ERROR.test(message)) return false;
  // Only guard when a real prior reload timestamp exists AND is within the
  // cooldown. "Never reloaded" (no stored value) must never guard — regardless of
  // how small `now` is — so the sentinel isn't confused with a recent reload.
  const raw = opts.storage.getItem(RELOAD_AT_KEY);
  const last = raw == null ? null : Number(raw);
  if (last != null && Number.isFinite(last) && opts.now - last < COOLDOWN_MS) return false;
  opts.storage.setItem(RELOAD_AT_KEY, String(opts.now));
  opts.reload();
  return true;
}
