import { describe, it, expect } from "vitest";
import * as route from "@/app/api/projects/[id]/competitors/route";

describe("competitor route module", () => {
  it("exports POST, DELETE, and PATCH handlers", () => {
    expect(typeof route.POST).toBe("function");
    expect(typeof route.DELETE).toBe("function");
    expect(typeof route.PATCH).toBe("function");
  });
});
