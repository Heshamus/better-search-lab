import { cookies } from "next/headers";
import { db } from "@/db/client";
import { getCurrentProject } from "@/lib/current-project";
import { listProjects } from "@/lib/projects";
import { listProfileCandidates } from "@/lib/profile";
import { listCompetitors } from "@/lib/competitors";
import { getRedditConfig } from "@/lib/reddit/reddit-config";
import { ProjectEditForm } from "@/components/project-edit-form";
import { ProfileReview } from "@/components/profile-review";
import { CompetitorManager } from "@/components/competitor-manager";
import { SettingsForm } from "@/components/settings-form";
import { RedditBriefEditor } from "@/components/reddit-brief-editor";
import { isDemoMode } from "@/lib/demo/mode";

// This page reads the DB (listProjects/getCurrentProject/listProfileCandidates/
// listCompetitors) via cookies() on every request — force-dynamic skips the
// build-time static-generation pass (which has no DB to connect to) rather
// than swallowing a non-fatal ECONNREFUSED. Purely a build-time hint; the
// route was already `ƒ` Dynamic.
export const dynamic = "force-dynamic";

const sectionHeadingClass = "text-sm font-semibold uppercase tracking-wide text-neutral-500";

// Server component (Task 18, mirrors Tasks 4-9): resolves the current project
// directly — no /api fetch; the (app) layout validates the session against the users table on every render (middleware only pre-filters for a JWT) — and reads
// everything the page mounts (project roster, this project's profile
// candidates, its tracked competitors) straight from src/lib. All mutation
// (edit/profile/delete, add-candidates, add/delete-competitor, tune-weights)
// lives in the nested client components, which each fetch their own guarded
// /api/* route and then router.refresh() this page. Adding a new site is not
// a mutation on this page anymore (Task 11) — it's a link out to the setup
// wizard's site step, which now owns project creation.
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  // requireAdminUser() bounces a member here with ?error=admin_only. Saying so
  // out loud is the difference between "the app ignored my click" and "that
  // section needs an admin" — see src/lib/auth/session.ts.
  const adminOnly = (await searchParams).error === "admin_only";
  const demo = isDemoMode();
  const [allProjects, project] = await Promise.all([
    listProjects(db),
    getCurrentProject(db, (await cookies()).get("sp_project")?.value),
  ]);

  const [candidates, competitorRows, redditConfig] = project
    ? await Promise.all([
        listProfileCandidates(db, project.id),
        listCompetitors(db, project.id),
        getRedditConfig(db, project.id),
      ])
    : [[], [], { knowledgeBrief: null, subreddits: [] }];

  return (
    <div className="flex flex-col gap-8">
      {adminOnly ? (
        <p role="status" className="rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-700">
          That section is for admins. Ask an admin if you need an integration connected or a user added.
        </p>
      ) : null}

      {allProjects.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className={sectionHeadingClass}>Your projects</h2>
          <ul className="panel flex flex-col gap-0 px-4">
            {allProjects.map((p: { id: string; name: string; domain: string }) => (
              <li
                key={p.id}
                data-testid={`project-row-${p.id}`}
                className="flex items-center justify-between gap-3 border-b border-neutral-100 py-2 text-sm last:border-0"
              >
                <span className="font-medium text-neutral-900">{p.name}</span>
                <span className="text-neutral-500">{p.domain}</span>
                {project && p.id === project.id ? (
                  <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-xs font-medium text-white">
                    Current
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {project ? (
        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h2 className={sectionHeadingClass}>Edit current project</h2>
            <p className="text-xs text-neutral-600">
              Rename or correct the domain, re-profile the site, or delete it. Changes here affect{" "}
              <span className="font-medium text-neutral-500">{project.name}</span> only.
            </p>
          </div>

          {/* key by id so a delete->refresh (or any in-place current-project
              change) remounts the form fresh from the new project's props,
              rather than keeping stale controlled inputs / a stuck Deleting…
              state seeded from the deleted one. */}
          <ProjectEditForm
            key={project.id}
            project={{ id: project.id, name: project.name, domain: project.domain }}
          />

          <SettingsForm
            projectId={project.id}
            weights={project.opportunityWeights}
            cadence={project.refreshCadence}
          />

          <div className="flex flex-col gap-2">
            <h3 className={sectionHeadingClass}>Profile keywords</h3>
            <ProfileReview
              projectId={project.id}
              candidates={candidates}
              locationCode={project.defaultLocationCode}
              languageCode={project.defaultLanguageCode}
            />
          </div>

          <div className="flex flex-col gap-2">
            <h3 className={sectionHeadingClass}>Competitors</h3>
            <CompetitorManager projectId={project.id} competitors={competitorRows} />
          </div>
        </section>
      ) : null}

      {project ? (
        <section className="flex flex-col gap-2">
          <h2 className={sectionHeadingClass}>Reddit Conversations</h2>
          <RedditBriefEditor
            projectId={project.id}
            knowledgeBrief={redditConfig.knowledgeBrief}
            subreddits={redditConfig.subreddits}
          />
        </section>
      ) : null}

      {/* Demo mode: the wizard is a mutation entry point (redirects itself
          to /overview — see (auth)/setup/page.tsx), so linking to it here
          would just be a dead click. */}
      {!demo ? (
        <section className="flex flex-col gap-2">
          <h2 className={sectionHeadingClass}>Add a site</h2>
          <p className="text-xs text-neutral-600">The setup wizard profiles the site, suggests competitors and runs the first build.</p>
          <a href="/setup?step=site" className="self-start rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#2a3138]">Add a site</a>
        </section>
      ) : null}
    </div>
  );
}
