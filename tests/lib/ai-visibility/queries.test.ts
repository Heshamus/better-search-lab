import { describe, it, expect } from "vitest";
import { buildQueries } from "@/lib/ai-visibility/queries";

const gsc20 = Array.from({ length: 20 }, (_, i) => `gsc query ${i}`);
const gen20 = Array.from({ length: 20 }, (_, i) => `generated query ${i}`);

describe("buildQueries", () => {
  it("splits 70/30 GSC/generated at the target size", async () => {
    const out = await buildQueries({ gscQueries: gsc20, generate: async () => gen20, total: 10 });
    expect(out).toHaveLength(10);
    expect(out.filter((q) => q.source === "gsc")).toHaveLength(7);
    expect(out.filter((q) => q.source === "generated")).toHaveLength(3);
  });

  it("dedupes case-insensitively across sources", async () => {
    const out = await buildQueries({ gscQueries: ["Best SEO Tool"], generate: async () => ["best  seo tool", "other"], total: 5 });
    const keys = out.map((q) => q.text.toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
    expect(out.filter((q) => q.source === "gsc")).toHaveLength(1);
  });

  it("fills the remainder from generated when GSC is short", async () => {
    const out = await buildQueries({ gscQueries: ["only one", "only two"], generate: async () => gen20, total: 10 });
    expect(out).toHaveLength(10);
    expect(out.filter((q) => q.source === "gsc")).toHaveLength(2);
    expect(out.filter((q) => q.source === "generated")).toHaveLength(8);
  });

  it("tops up from GSC when generation runs dry", async () => {
    const out = await buildQueries({ gscQueries: gsc20, generate: async () => [], total: 10 });
    expect(out).toHaveLength(10);
    expect(out.every((q) => q.source === "gsc")).toBe(true);
  });

  it("survives a throwing generator (GSC only)", async () => {
    const out = await buildQueries({
      gscQueries: gsc20,
      generate: async () => {
        throw new Error("x");
      },
      total: 6,
    });
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((q) => q.source === "gsc")).toBe(true);
  });
});
