import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { getCurrentProject } from "@/lib/current-project";

let close: () => Promise<void>;
afterEach(() => close?.());

describe("getCurrentProject", () => {
  it("returns the project matching the cookie id", async () => {
    const t = await createTestDb(); close = t.close;
    await createProject(t.db, { name: "A", domain: "a.com" });
    const b = await createProject(t.db, { name: "B", domain: "b.com" });

    const result = await getCurrentProject(t.db, b.id);
    expect(result?.id).toBe(b.id);
  });

  it("falls back to the first project when the cookie id matches no project", async () => {
    const t = await createTestDb(); close = t.close;
    const a = await createProject(t.db, { name: "A", domain: "a.com" });
    await createProject(t.db, { name: "B", domain: "b.com" });

    const result = await getCurrentProject(t.db, "nonexistent");
    expect(result?.id).toBe(a.id);
  });

  it("falls back to the first project when no cookie value is passed", async () => {
    const t = await createTestDb(); close = t.close;
    const a = await createProject(t.db, { name: "A", domain: "a.com" });
    await createProject(t.db, { name: "B", domain: "b.com" });

    const result = await getCurrentProject(t.db, undefined);
    expect(result?.id).toBe(a.id);
  });

  it("returns null when there are no projects at all", async () => {
    const t = await createTestDb(); close = t.close;

    const result = await getCurrentProject(t.db, undefined);
    expect(result).toBeNull();
  });
});
