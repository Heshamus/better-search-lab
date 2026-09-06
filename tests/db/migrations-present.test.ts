import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("migrations", () => {
  it("has at least one generated SQL migration", () => {
    const files = readdirSync("drizzle").filter((f) => f.endsWith(".sql"));
    expect(files.length).toBeGreaterThan(0);
  });
});

describe("first-admin promotion migration", () => {
  it("promotes the oldest user to admin only when no admin exists", () => {
    const file = readdirSync("drizzle").find((f) => f.includes("promote_first_admin"));
    expect(file).toBeDefined();
    const sqlText = readFileSync(join("drizzle", file!), "utf8");
    expect(sqlText).toMatch(/UPDATE\s+"?users"?\s+SET\s+"?role"?\s*=\s*'admin'/i);
    expect(sqlText).toMatch(/NOT EXISTS/i);
    expect(sqlText).toMatch(/ORDER BY\s+"?created_at"?\s+(ASC\s+)?LIMIT 1/i);
  });
});
