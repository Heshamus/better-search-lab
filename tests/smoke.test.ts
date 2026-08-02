import { describe, it, expect } from "vitest";
import { ping } from "@/config/ping";

describe("toolchain", () => {
  it("resolves the @/ alias and runs TS", () => {
    expect(ping()).toBe("pong");
  });
});
