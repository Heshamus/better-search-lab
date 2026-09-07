import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { countUsers } from "@/lib/auth/users";
import { resolveSessionUser } from "@/lib/auth/session";
import { getConfig } from "@/lib/config/resolve";
import { listProjects } from "@/lib/projects";
import { listProfileCandidates } from "@/lib/profile";
import { listTrackedKeywords } from "@/lib/keywords";
import { listCompetitors } from "@/lib/competitors";
import { selectSetupStep } from "@/lib/setup/state";
import { readOnboarding } from "@/lib/setup/onboarding";
import { SetupWizard } from "@/components/setup-wizard";
import { CreateAdminForm } from "@/components/create-admin-form";
import { AdminOnly } from "@/components/setup/admin-only";
import { DataForSeoStep } from "@/components/setup/dataforseo-step";
import { LlmStep } from "@/components/setup/llm-step";
import { SiteStep } from "@/components/setup/site-step";

export const dynamic = "force-dynamic";

/**
 * The setup wizard (spec §11.1): the server picks the first PERSISTED pending
 * step and renders it. Public only while there are no users; every later
 * step needs a session, and steps 2–3 need an admin.
 */
export default async function SetupPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const sp = await searchParams;
  const userCount = await countUsers(db);
  const session = userCount === 0 ? null : await resolveSessionUser();
  if (userCount > 0 && !session) redirect("/login?callbackUrl=%2Fsetup");

  const cfg = await getConfig(db, { fresh: true });
  const projects = await listProjects(db);
  const currentProjectId = (await cookies()).get("sp_project")?.value;
  const sel = selectSetupStep({ userCount, role: session?.role ?? null, cfg, projects, currentProjectId, stepParam: sp.step });
  if (sel.step === "done" && cfg.setup.completedAt) redirect("/overview");

  let body: React.ReactNode;
  if (sel.blocked === "admin_required" && (sel.step === "dataforseo" || sel.step === "llm")) {
    body = <AdminOnly step={sel.step} />;
  } else if (sel.step === "account") {
    body = (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-base font-semibold text-white">Create your admin account</h1>
          <p className="mt-1 text-sm text-neutral-400">This is the only account that can manage users and integrations. You can add more people later in Settings.</p>
        </div>
        <CreateAdminForm next="/setup" />
      </div>
    );
  } else if (sel.step === "dataforseo") {
    body = <DataForSeoStep />;
  } else if (sel.step === "llm") {
    body = <LlmStep />;
  } else if (sel.step === "site") {
    body = <SiteStep />;
  } else {
    // Steps 5–8 arrive in Tasks 9–10; until then the page shows where it stopped.
    body = <p className="text-sm text-neutral-400">Step “{sel.step}” is not built yet.</p>;
  }
  // Keep these loads here so later tasks only extend the switch above:
  void listProfileCandidates; void listTrackedKeywords; void listCompetitors; void readOnboarding;

  return <SetupWizard step={sel.step}>{body}</SetupWizard>;
}
