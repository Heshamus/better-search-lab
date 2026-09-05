import { describe, it, expect } from "vitest";
import { SETTINGS, GROUPS, LLM_PRESETS, LLM_PROVIDERS, settingByKey, settingsInGroup } from "@/lib/config/registry";

describe("settings registry", () => {
  it("declares every key exactly once, as <group>.<field>", () => {
    const keys = SETTINGS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const s of SETTINGS) expect(s.key).toBe(`${s.group}.${s.field}`);
  });
  it("maps every key to a unique env override name (legacy names included)", () => {
    const names = SETTINGS.flatMap((s) => [s.env, ...(s.legacyEnv ?? [])]);
    expect(new Set(names).size).toBe(names.length);
  });
  it("only uses declared groups", () => {
    const ids = new Set(GROUPS.map((g) => g.id));
    for (const s of SETTINGS) expect(ids.has(s.group)).toBe(true);
  });
  it("marks credentials secret and non-credentials plain", () => {
    expect(settingByKey("dataforseo.password")?.secret).toBe(true);
    expect(settingByKey("llm.apiKey")?.secret).toBe(true);
    expect(settingByKey("email.smtpPassword")?.secret).toBe(true);
    expect(settingByKey("llm.model")?.secret).toBe(false);
    expect(settingByKey("app.url")?.secret).toBe(false);
  });
  it("honors the legacy DEEPSEEK_API_KEY and REPORT_EMAIL_FROM names", () => {
    expect(settingByKey("llm.apiKey")?.legacyEnv).toEqual(["DEEPSEEK_API_KEY"]);
    expect(settingByKey("email.from")?.legacyEnv).toEqual(["REPORT_EMAIL_FROM"]);
  });
  it("validates values with the declared schema", () => {
    expect(settingByKey("app.url")!.schema.safeParse("not a url").success).toBe(false);
    expect(settingByKey("app.url")!.schema.parse("https://bsl.example/")).toBe("https://bsl.example");
    expect(settingByKey("email.smtpPort")!.schema.safeParse("abc").success).toBe(false);
    expect(settingByKey("llm.provider")!.schema.safeParse("nope").success).toBe(false);
    expect(settingByKey("llm.provider")!.schema.parse("ollama")).toBe("ollama");
  });
  it("has a preset for every LLM provider, and only ollama may run without a key", () => {
    for (const p of LLM_PROVIDERS) expect(LLM_PRESETS[p]).toBeDefined();
    expect(LLM_PRESETS.ollama.needsKey).toBe(false);
    expect(LLM_PRESETS.anthropic.kind).toBe("anthropic");
    expect(LLM_PRESETS.anthropic.defaultModel).toBe("claude-opus-5");
    expect(LLM_PRESETS.deepseek.baseUrl).toBe("https://api.deepseek.com");
  });
  it("lists a group's settings in declaration order", () => {
    expect(settingsInGroup("dataforseo").map((s) => s.key)).toEqual(["dataforseo.login", "dataforseo.password"]);
  });
});
