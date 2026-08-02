import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { projects } from "@/db/schema";

let close: () => Promise<void>;
afterEach(() => close?.());

describe("schema", () => {
  it("inserts and reads a project row", async () => {
    const t = await createTestDb(); close = t.close;
    const [row] = await t.db.insert(projects).values({
      name: "HarperFlow", domain: "harperflow.io",
    }).returning();
    expect(row.domain).toBe("harperflow.io");
    expect(row.refreshCadence).toBe("weekly"); // default
  });
});
