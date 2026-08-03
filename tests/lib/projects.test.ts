import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { competitors } from "@/db/schema";
import { createProject, listProjects } from "@/lib/projects";
import { eq } from "drizzle-orm";

let close: () => Promise<void>;
afterEach(() => close?.());

describe("projects", () => {
  it("creates a project with competitors and lists it", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io", competitors: ["rival.com"] });
    expect(p.domain).toBe("harperflow.io");
    const comps = await t.db.select().from(competitors).where(eq(competitors.projectId, p.id));
    expect(comps.map((c) => c.domain)).toEqual(["rival.com"]);
    expect(await listProjects(t.db)).toHaveLength(1);
  });
});
