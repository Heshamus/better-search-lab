import { redirect } from "next/navigation";
import { resolveSessionUser } from "@/lib/auth/session";
import { AppShell } from "@/components/app-shell";
import { db } from "@/db/client";
import { readUpdateState } from "@/lib/lifecycle/state";

// Every (app) page is force-dynamic, so this layout runs per request: the one
// place every dashboard render validates the session against the users table
// (deleted user, bumped session_version, pre-upgrade token → back to login).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await resolveSessionUser();
  if (!user) redirect("/login?reason=signed-out");
  const update = await readUpdateState(db);
  return (
    <AppShell user={{ email: user.email, role: user.role }} update={update}>
      {children}
    </AppShell>
  );
}
