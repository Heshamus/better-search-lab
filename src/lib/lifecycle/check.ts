import { getConfig } from "@/lib/config/resolve";
import { writeSettings } from "@/lib/config/store";
import { keyFromEnv } from "@/lib/config/crypto";
import { loadEnv } from "@/config/env";
import { fetchLatestRelease } from "@/lib/lifecycle/gitlab-releases";

/**
 * The app's only outbound call. Run once at worker boot and then daily off a
 * cron (see worker/index.ts). FAIL-SOFT by design: never throws — a bad
 * network, a down GitLab, or a malformed response must never take down the
 * scheduler or the boot sequence. No-ops when the admin turned checks off.
 *
 * Task 3's finalizeConfig already resolves `updates.checkEnabled` to a plain
 * boolean (default true; only the stored/env literal "false" flips it — see
 * src/lib/config/app-config.ts), so the guard below is a single boolean
 * check, not a string/boolean dual-form guard.
 */
export async function checkForUpdate(db: any, opts?: { fetchImpl?: typeof fetch }): Promise<void> {
  try {
    const cfg = await getConfig(db, { fresh: true });
    if (!cfg.updates.checkEnabled) return;

    const r = await fetchLatestRelease({ fetchImpl: opts?.fetchImpl });
    if (!r.ok) return; // fail-soft: leave the last known state in place

    await writeSettings(
      db,
      keyFromEnv(loadEnv()),
      {
        "updates.latestVersion": r.version,
        "updates.latestUrl": r.url,
        "updates.checkedAt": new Date().toISOString(),
      },
      null,
    );
  } catch {
    // fail-soft: never throw out of the scheduler/boot path
  }
}
