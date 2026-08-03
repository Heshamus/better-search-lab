import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { competitors } from "@/db/schema";
import {
  listCompetitors,
  addCompetitor,
  removeCompetitor,
  updateCompetitorDomain,
  normalizeDomain,
  MAX_COMPETITORS,
  CompetitorCapError,
} from "@/lib/competitors";

let close: () => Promise<void>;
afterEach(() => close?.());

// Pure-function suite: deliberately placed before any describe block below
// that calls createTestDb(). The shared `close` above is only ever
// reassigned by a test that opens a db, and afterEach unconditionally
// re-invokes whatever it last pointed to — placing a db-free test after one
// that already ran its own afterEach close would re-close an already-closed
// PGlite instance and fail this test on a hook error unrelated to its
// assertions.
describe("normalizeDomain", () => {
  it("strips scheme, www, path, trailing slash and lowercases", () => {
    expect(normalizeDomain("HTTPS://www.Rival.com/pricing/")).toBe("rival.com");
    expect(normalizeDomain("rival.com")).toBe("rival.com");
  });
});

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

describe("competitor CRUD", () => {
  it("adds, dedupes, caps at 5, edits, and removes", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });

    const a = await addCompetitor(t.db, p.id, "https://www.rival-a.com/");
    expect(a.domain).toBe("rival-a.com");
    const again = await addCompetitor(t.db, p.id, "rival-a.com"); // dedupe
    expect(again.id).toBe(a.id);
    expect((await listCompetitors(t.db, p.id)).length).toBe(1);

    for (const d of ["b.com", "c.com", "d.com", "e.com"]) await addCompetitor(t.db, p.id, d);
    expect((await listCompetitors(t.db, p.id)).length).toBe(MAX_COMPETITORS);

    // Dedupe-before-cap guarantee: the project is now at 5/5. Re-adding an
    // ALREADY-TRACKED domain ("rival-a.com", added as `a` above) must return
    // the existing row rather than throwing CompetitorCapError, and must not
    // insert a duplicate. Awaiting it directly (no .rejects/try-catch) means
    // this assertion itself fails loudly if addCompetitor throws here.
    const dedupeAtCap = await addCompetitor(t.db, p.id, "rival-a.com");
    expect(dedupeAtCap.id).toBe(a.id);
    expect((await listCompetitors(t.db, p.id)).length).toBe(MAX_COMPETITORS);

    await expect(addCompetitor(t.db, p.id, "f.com")).rejects.toBeInstanceOf(CompetitorCapError);

    await updateCompetitorDomain(t.db, a.id, "rival-a-new.com");
    expect((await listCompetitors(t.db, p.id)).find((c) => c.id === a.id)!.domain).toBe("rival-a-new.com");

    await removeCompetitor(t.db, p.id, a.id);
    expect((await listCompetitors(t.db, p.id)).some((c) => c.id === a.id)).toBe(false);
  });

  it("orders competitors by creation time", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });
    await addCompetitor(t.db, p.id, "first.com");
    await addCompetitor(t.db, p.id, "second.com");
    expect((await listCompetitors(t.db, p.id)).map((c) => c.domain)).toEqual(["first.com", "second.com"]);
  });

  it("removeCompetitor is project-scoped — a cross-project id is a no-op", async () => {
    const t = await createTestDb(); close = t.close;
    const p1 = await createProject(t.db, { name: "HF", domain: "harperflow.io" });
    const p2 = await createProject(t.db, { name: "Other", domain: "other.io" });
    const c1 = await addCompetitor(t.db, p1.id, "rival-a.com");
    const c2 = await addCompetitor(t.db, p2.id, "rival-b.com");

    await removeCompetitor(t.db, p1.id, c2.id); // p1 tries to delete p2's competitor by id

    expect((await listCompetitors(t.db, p2.id)).some((c) => c.id === c2.id)).toBe(true);
    expect((await listCompetitors(t.db, p1.id)).some((c) => c.id === c1.id)).toBe(true);
  });
});
