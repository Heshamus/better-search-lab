import { describe, it, expect } from "vitest";
import { DataForSeoError } from "@/lib/dataforseo/client";
describe("DataForSeoError.kind", () => {
  it("defaults kind and carries status", () => {
    const httpErr = new DataForSeoError("DataForSEO 500", 500, undefined, "http");
    expect(httpErr.kind).toBe("http");
    const taskErr = new DataForSeoError("task 40200", 40200, undefined, "task");
    expect(taskErr.kind).toBe("task");
  });
});
