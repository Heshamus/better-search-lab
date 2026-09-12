import { getConfig } from "@/lib/config/resolve";
import { APP_VERSION, isNewer } from "@/lib/lifecycle/version";

export type UpdateState = {
  current: string;
  latest: string | null;
  url: string | null;
  available: boolean;
  bannerDismissed: boolean;
  firstRunPending: boolean;
};

/**
 * Admin-facing update state, derived from the `updates` settings group
 * (Task 3) — a pure read of whatever the daily worker check (Task 4) last
 * wrote. Never touches the network itself and never throws (getConfig is
 * already fail-soft), so it's safe to call unconditionally from the app
 * layout on every request.
 */
export async function readUpdateState(db: any): Promise<UpdateState> {
  const u = (await getConfig(db)).updates;
  const latest = u.latestVersion ?? null;
  const available = latest ? isNewer(APP_VERSION, latest) : false;
  return {
    current: APP_VERSION,
    latest,
    url: u.latestUrl ?? null,
    available,
    bannerDismissed: !!latest && u.dismissedVersion === latest,
    firstRunPending: !u.firstRunDismissedAt,
  };
}
