import { projects, competitors } from "@/db/schema";

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
