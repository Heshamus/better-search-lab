import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { competitors, projects } from "@/db/schema";
import { createProject, listProjects, updateProject, deleteProject } from "@/lib/projects";
import { eq } from "drizzle-orm";

let close: () => Promise<void>;
afterEach(() => close?.());

describe("projects", () => {
  it("creates a project with competitors and lists it", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com", competitors: ["rival.com"] });
    expect(p.domain).toBe("example-site.com");
    const comps = await t.db.select().from(competitors).where(eq(competitors.projectId, p.id));
    expect(comps.map((c) => c.domain)).toEqual(["rival.com"]);
    expect(await listProjects(t.db)).toHaveLength(1);
  });
});

describe("updateProject / deleteProject", () => {
  it("updates only provided non-empty fields", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "Old", domain: "old.io" });
    await updateProject(t.db, p.id, { name: "New" });
    let [row] = await t.db.select().from(projects).where(eq(projects.id, p.id));
    expect(row.name).toBe("New");
    expect(row.domain).toBe("old.io"); // untouched
    await updateProject(t.db, p.id, { domain: "new.io", name: "" }); // empty name ignored
    [row] = await t.db.select().from(projects).where(eq(projects.id, p.id));
    expect(row.domain).toBe("new.io");
    expect(row.name).toBe("New");
  });

  it("deletes a project", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "X", domain: "x.io" });
    await deleteProject(t.db, p.id);
    expect(await t.db.select().from(projects).where(eq(projects.id, p.id))).toEqual([]);
  });
});
