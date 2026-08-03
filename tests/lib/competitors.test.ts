import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { competitors } from "@/db/schema";
import { listCompetitors } from "@/lib/competitors";

let close: () => Promise<void>;
afterEach(() => close?.());

describe("listCompetitors", () => {
  it("returns the project's competitor {id, domain} rows", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });
    await t.db.insert(competitors).values([
      { projectId: p.id, domain: "rival-a.com" },
      { projectId: p.id, domain: "rival-b.com" },
    ]);

    const rows = await listCompetitors(t.db, p.id);
    expect(rows.map((r) => r.domain).sort()).toEqual(["rival-a.com", "rival-b.com"]);
    expect(rows[0]).toHaveProperty("id");
  });

  it("does not return another project's competitors", async () => {
    const t = await createTestDb(); close = t.close;
    const p1 = await createProject(t.db, { name: "HF", domain: "harperflow.io" });
    const p2 = await createProject(t.db, { name: "Other", domain: "other.io" });
    await t.db.insert(competitors).values([{ projectId: p1.id, domain: "rival-a.com" }]);

    expect(await listCompetitors(t.db, p2.id)).toEqual([]);
  });
});
