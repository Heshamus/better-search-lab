import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { renderConfigDocs } from "../../scripts/gen-config-docs";

describe("docs/configuration.md", () => {
  it("is exactly what the registry renders (run `pnpm docs:config` after changing the registry)", () => {
    expect(readFileSync("docs/configuration.md", "utf8")).toBe(renderConfigDocs());
  });
  it("documents every non-hidden setting and the bootstrap variables", () => {
    const md = renderConfigDocs();
    for (const env of ["DATABASE_URL", "AUTH_SECRET", "ENCRYPTION_KEY", "DEMO_MODE", "TRUSTED_PROXY_HOPS", "DATAFORSEO_LOGIN", "LLM_API_KEY", "DEEPSEEK_API_KEY", "REPORT_EMAIL_TO"]) expect(md).toContain(env);
    expect(md).not.toContain("SETUP_LLM_STEP");
  });
});
