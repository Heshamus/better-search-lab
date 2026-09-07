import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { countUsers } from "@/lib/auth/users";
import { resolveSessionUser } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/demo/mode";
import { getConfig } from "@/lib/config/resolve";
import { listProjects } from "@/lib/projects";
import { listProfileCandidates } from "@/lib/profile";
import { listTrackedKeywords } from "@/lib/keywords";
import { listCompetitors } from "@/lib/competitors";
import { selectSetupStep } from "@/lib/setup/state";
import { readOnboarding } from "@/lib/setup/onboarding";
import { estimateCost } from "@/lib/dataforseo/cost";
import { SetupWizard } from "@/components/setup-wizard";
import { CreateAdminForm } from "@/components/create-admin-form";
import { AdminOnly } from "@/components/setup/admin-only";
import { DataForSeoStep } from "@/components/setup/dataforseo-step";
import { LlmStep } from "@/components/setup/llm-step";
import { SiteStep } from "@/components/setup/site-step";
import { ProfileStep } from "@/components/setup/profile-step";
import { CompetitorsStep } from "@/components/setup/competitors-step";
import { BuildStep } from "@/components/setup/build-step";
import { DoneStep } from "@/components/setup/done-step";

export const dynamic = "force-dynamic";

/**
 * The setup wizard (spec §11.1): the server picks the first PERSISTED pending
 * step and renders it. Public only while there are no users; every later
 * step needs a session, and steps 2–3 need an admin.
 */
export default async function SetupPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  // The demo admin exists but never configures DataForSEO, so selectSetupStep
  // below would otherwise land the seeded admin on a live, submittable
  // DataForSeoStep — a mutation entry point the demo boundary is supposed to
  // close off. The wizard has no place in a read-only demo at all.
  if (isDemoMode()) redirect("/overview");
  const sp = await searchParams;
  const userCount = await countUsers(db);
  const session = userCount === 0 ? null : await resolveSessionUser();
  if (userCount > 0 && !session) redirect("/login?callbackUrl=%2Fsetup");

  const cfg = await getConfig(db, { fresh: true });
  const projects = await listProjects(db);
  const currentProjectId = (await cookies()).get("sp_project")?.value;
  const sel = selectSetupStep({ userCount, role: session?.role ?? null, cfg, projects, currentProjectId, stepParam: sp.step });
  if (sel.step === "done" && cfg.setup.completedAt) redirect("/overview");

  const extrasCost = estimateCost("/v3/backlinks/summary/live", 1) + estimateCost("/v3/backlinks/referring_domains/live", 1) + estimateCost("/v3/backlinks/anchors/live", 1) + estimateCost("/v3/dataforseo_labs/google/ranked_keywords/live", 1);

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
  } else if (sel.step === "profile" && sel.project) {
    const [candidates, tracked] = await Promise.all([listProfileCandidates(db, sel.project.id), listTrackedKeywords(db, sel.project.id)]);
    const p = projects.find((x: { id: string; name: string; domain: string; defaultLocationCode: number; defaultLanguageCode: string }) => x.id === sel.project!.id)!;
    body = <ProfileStep project={{ id: p.id, name: p.name, domain: p.domain, defaultLocationCode: p.defaultLocationCode, defaultLanguageCode: p.defaultLanguageCode }} candidates={candidates} trackedCount={tracked.length} />;
  } else if (sel.step === "competitors" && sel.project) {
    body = <CompetitorsStep projectId={sel.project.id} competitors={await listCompetitors(db, sel.project.id)} />;
  } else if (sel.step === "build" && sel.project) {
    body = <BuildStep projectId={sel.project.id} onboarding={readOnboarding(sel.project.onboarding)} extrasCost={extrasCost} />;
  } else if (sel.step === "done") {
    body = <DoneStep projectName={sel.project?.name ?? projects[0]?.name ?? "Your site"} />;
  } else body = null;

  return <SetupWizard step={sel.step}>{body}</SetupWizard>;
}
