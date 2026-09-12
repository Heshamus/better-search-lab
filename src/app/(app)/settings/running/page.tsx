import { requireAdminUser } from "@/lib/auth/session";
import { readUpdateState } from "@/lib/lifecycle/state";
import { getConfig } from "@/lib/config/resolve";
import { db } from "@/db/client";
import { RunningUpdatesPanel } from "@/components/running-updates-panel";

export const dynamic = "force-dynamic";

export default async function RunningUpdatesPage() {
  await requireAdminUser();
  const update = await readUpdateState(db);
  // Ruling 2: `updates.checkEnabled` is a resolved boolean (default ON —
  // see app-config.ts's `!== "false"`), read through getConfig like every
  // other settings value. Never hardcode this.
  const checkEnabled = (await getConfig(db)).updates.checkEnabled;
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-neutral-900">Running &amp; updates</h2>
        <p className="text-xs text-neutral-500">Version status, update commands, and how to keep the app running across reboots.</p>
      </div>
      <RunningUpdatesPanel update={update} checkEnabled={checkEnabled} />
    </section>
  );
}
