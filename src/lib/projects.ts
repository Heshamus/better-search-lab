import { projects, competitors } from "@/db/schema";
import { eq } from "drizzle-orm";
import { applyOnboardingPatch, initialOnboarding, readOnboarding, type Onboarding, type OnboardingPatch } from "@/lib/setup/onboarding";

export async function createProject(db: any, input: {
  name: string; domain: string; competitors?: string[];
  defaultLocationCode?: number; defaultLanguageCode?: string; defaultDevice?: "desktop" | "mobile";
  /** Defaults to all-pending so the wizard walks a new site through profile → competitors → build. Seeders pass COMPLETE_ONBOARDING. */
  onboarding?: Onboarding;
}) {
  const values: Record<string, unknown> = { name: input.name, domain: input.domain, onboarding: input.onboarding ?? initialOnboarding() };
  if (input.defaultLocationCode !== undefined) values.defaultLocationCode = input.defaultLocationCode;
  if (input.defaultLanguageCode !== undefined) values.defaultLanguageCode = input.defaultLanguageCode;
  if (input.defaultDevice !== undefined) values.defaultDevice = input.defaultDevice;
  const [project] = await db.insert(projects).values(values).returning();
  if (input.competitors?.length) {
    await db.insert(competitors).values(input.competitors.map((domain) => ({ projectId: project.id, domain })));
  }
  return project;
}

/** Read-modify-write of the onboarding blob under a row lock; null when the project does not exist. */
export async function updateOnboarding(db: any, id: string, patch: OnboardingPatch): Promise<Onboarding | null> {
  return db.transaction(async (tx: any) => {
    const [row] = await tx.select({ onboarding: projects.onboarding }).from(projects).where(eq(projects.id, id)).for("update");
    if (!row) return null;
    const next = applyOnboardingPatch(readOnboarding(row.onboarding), patch);
    await tx.update(projects).set({ onboarding: next }).where(eq(projects.id, id));
    return next;
  });
}

export async function listProjects(db: any) {
  return db.select().from(projects);
}

/**
 * Updates only the provided Settings-screen fields on a project
 * (`opportunityWeights` and/or `refreshCadence`) — an absent field is left
 * untouched, never reset to a default. Called by the guarded
 * `POST /api/projects/[id]/settings` route after it validates `refreshCadence`
 * and coerces weight values.
 */
export async function updateProjectSettings(
  db: any,
  id: string,
  updates: { opportunityWeights?: Record<string, number>; refreshCadence?: string },
): Promise<void> {
  const set: Record<string, unknown> = {};
  if (updates.opportunityWeights !== undefined) set.opportunityWeights = updates.opportunityWeights;
  if (updates.refreshCadence !== undefined) set.refreshCadence = updates.refreshCadence;
  if (Object.keys(set).length === 0) return;
  await db.update(projects).set(set).where(eq(projects.id, id));
}

/**
 * Renames a project and/or corrects its domain. Only fields present AND
 * non-blank in `updates` are written — an omitted or whitespace-only field
 * is left untouched, so a typo fix never accidentally wipes the other
 * field. Called by the guarded `PATCH /api/projects/[id]` route.
 */
export async function updateProject(
  db: any,
  id: string,
  updates: { name?: string; domain?: string },
): Promise<void> {
  const set: Record<string, unknown> = {};
  if (updates.name && updates.name.trim()) set.name = updates.name.trim();
  if (updates.domain && updates.domain.trim()) set.domain = updates.domain.trim();
  if (Object.keys(set).length === 0) return;
  await db.update(projects).set(set).where(eq(projects.id, id));
}

/**
 * Deletes a project. Child rows (competitors, keywords, competitor gaps,
 * profile candidates, opportunities, jobs, and their own dependents such as
 * rank snapshots) are removed via the `onDelete: "cascade"` FKs declared on
 * `src/db/schema.ts` — no manual cleanup needed here. Called by the guarded
 * `DELETE /api/projects/[id]` route.
 */
export async function deleteProject(db: any, id: string): Promise<void> {
  await db.delete(projects).where(eq(projects.id, id));
}
