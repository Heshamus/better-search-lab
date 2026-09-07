import { describe, it, expect, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/test-db";
import { projects } from "@/db/schema";
import { createProject, updateOnboarding } from "@/lib/projects";
import { initialOnboarding, readOnboarding } from "@/lib/setup/onboarding";

let close: () => Promise<void>;
afterEach(() => { close?.(); });

describe("project onboarding persistence", () => {
  it("createProject stores market, device and all-pending onboarding by default", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "A", domain: "example-site.com", defaultLocationCode: 2826, defaultLanguageCode: "en", defaultDevice: "mobile" });
    const [row] = await t.db.select().from(projects).where(eq(projects.id, p.id));
    expect(row.defaultLocationCode).toBe(2826);
    expect(row.defaultDevice).toBe("mobile");
    expect(readOnboarding(row.onboarding)).toEqual(initialOnboarding());
  });
  it("updateOnboarding merges and returns the new state, null for an unknown id", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "A", domain: "example-site.com" });
    expect(await updateOnboarding(t.db, p.id, { profile: "done" })).toMatchObject({ profile: "done", competitors: "pending" });
    expect(await updateOnboarding(t.db, p.id, { build: "running", buildJobs: { refreshAll: "j1" } })).toMatchObject({ profile: "done", build: "running", buildJobs: { refreshAll: "j1" } });
    expect(await updateOnboarding(t.db, "00000000-0000-4000-8000-000000000000", { profile: "done" })).toBeNull();
  });
});
