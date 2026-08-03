import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";

describe("migrations", () => {
  it("has at least one generated SQL migration", () => {
    const files = readdirSync("drizzle").filter((f) => f.endsWith(".sql"));
    expect(files.length).toBeGreaterThan(0);
  });
});
