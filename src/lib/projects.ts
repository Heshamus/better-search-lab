import { projects, competitors } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function createProject(db: any, input: { name: string; domain: string; competitors?: string[] }) {
  const [project] = await db.insert(projects).values({ name: input.name, domain: input.domain }).returning();
  if (input.competitors?.length) {
    await db.insert(competitors).values(input.competitors.map((domain) => ({ projectId: project.id, domain })));
  }
  return project;
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
