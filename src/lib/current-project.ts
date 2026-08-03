import { listProjects } from "@/lib/projects";
import type { projects } from "@/db/schema";

export type Project = typeof projects.$inferSelect;

/**
 * Resolves which project a dashboard page should render, given the raw
 * `sp_project` cookie value (or `undefined` if absent/never set).
 *
 * Intended page usage (server component):
 *
 *   import { cookies } from "next/headers";
 *   import { db } from "@/db/client";
 *   import { getCurrentProject } from "@/lib/current-project";
 *
 *   const project = await getCurrentProject(db, (await cookies()).get("sp_project")?.value);
 *   if (!project) return <EmptyState title="No projects yet" description="Create your first project in Settings" />;
 *
 * Deliberately pure w.r.t. `cookieProjectId` — this function never reads
 * cookies itself. `next/headers`'s `cookies()` only works inside a request
 * context (server component / route handler), so keeping that read at the
 * call site is what makes this function trivially unit-testable with a
 * plain string and a pglite `db`.
 *
 * Resolution order: the project matching `cookieProjectId` (if it still
 * exists — the cookie can point at a since-deleted project) > the first
 * project from `listProjects` (a stable default; this is a single-tenant
 * tool with 1-5 projects, so "first" needs no fancier tie-break) > `null`
 * when there are no projects at all. Callers must render an EmptyState in
 * the `null` case, never crash.
 */
export async function getCurrentProject(
  db: any,
  cookieProjectId?: string,
): Promise<Project | null> {
  const all: Project[] = await listProjects(db);
  if (all.length === 0) return null;

  const matched = cookieProjectId ? all.find((p) => p.id === cookieProjectId) : undefined;
  return matched ?? all[0];
}
