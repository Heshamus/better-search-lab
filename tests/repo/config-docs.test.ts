import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { renderConfigDocs } from "../../scripts/gen-config-docs";
import { GROUPS, SETTINGS } from "@/lib/config/registry";

describe("docs/configuration.md", () => {
  it("is exactly what the registry renders (run `pnpm docs:config` after changing the registry)", () => {
    expect(readFileSync("docs/configuration.md", "utf8")).toBe(renderConfigDocs());
  });
  it("documents every non-hidden setting and the bootstrap variables", () => {
    const md = renderConfigDocs();
    for (const env of ["DATABASE_URL", "AUTH_SECRET", "ENCRYPTION_KEY", "DEMO_MODE", "TRUSTED_PROXY_HOPS"]) expect(md).toContain(env);
    // Registry-driven, so a group or setting dropped from the render silently
    // (rather than just reworded) fails this test even though both sides of
    // the byte-exact test above would still agree with each other.
    const hiddenGroupIds = new Set(GROUPS.filter((g) => g.hidden).map((g) => g.id));
    for (const s of SETTINGS) {
      if (hiddenGroupIds.has(s.group)) {
        expect(md).not.toContain(s.env);
      } else {
        expect(md).toContain(s.env);
        for (const legacy of s.legacyEnv ?? []) expect(md).toContain(legacy);
      }
    }
  });
});
