import { cookies } from "next/headers";
import { db } from "@/db/client";
import { getCurrentProject } from "@/lib/current-project";
import { listProjects } from "@/lib/projects";
import { ProjectCreateForm } from "@/components/project-create-form";
import { SettingsForm } from "@/components/settings-form";

// Server component (Task 9, mirrors Tasks 4-8): resolves the current
// project directly — no /api fetch, (app)/* is already middleware-guarded —
// and also reads the full project roster via listProjects so the page can
// show which sites already exist, not just the current one. All mutation
// (create project, save weights/cadence) lives in the two nested client
// components, which fetch their own guarded /api/* route and then
// router.refresh() this page.
//
// No-projects case (brief): ProjectCreateForm is unconditional, so with zero
// projects it IS the primary content — no EmptyState "no projects" wrapper
// (unlike Usage/Content, which have nothing else useful to show). Once a
// current project exists, SettingsForm renders alongside it for tuning.
export default async function SettingsPage() {
  const [allProjects, project] = await Promise.all([
    listProjects(db),
    getCurrentProject(db, (await cookies()).get("sp_project")?.value),
  ]);

  return (
    <div className="flex flex-col gap-6">
      {allProjects.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Your projects
          </h2>
          <ul className="flex flex-col gap-0 rounded-xl border border-neutral-200 bg-white px-4 dark:border-neutral-800 dark:bg-neutral-900">
            {allProjects.map((p: { id: string; name: string; domain: string }) => (
              <li
                key={p.id}
                data-testid={`project-row-${p.id}`}
                className="flex items-center justify-between gap-3 border-b border-neutral-100 py-2 text-sm last:border-0 dark:border-neutral-800/60"
              >
                <span className="font-medium text-neutral-900 dark:text-white">{p.name}</span>
                <span className="text-neutral-500 dark:text-neutral-400">{p.domain}</span>
                {project && p.id === project.id ? (
                  <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent">
                    Current
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ProjectCreateForm />

      {project ? (
        <SettingsForm projectId={project.id} weights={project.opportunityWeights} cadence={project.refreshCadence} />
      ) : null}

      <p className="text-xs text-neutral-400 dark:text-neutral-600">
        The sign-in allowlist is managed via environment configuration, not this screen.
      </p>
    </div>
  );
}
