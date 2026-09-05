import { loadEnv } from "@/config/env";
import { SETTINGS } from "./registry";
import { keyFromEnv } from "./crypto";
import { readAllSettings, type StoredSetting } from "./store";
import { getCachedConfig, setCachedConfig } from "./cache";
import { finalizeConfig, type AppConfig, type ConfigProblem } from "./app-config";

type EnvSource = Record<string, string | undefined>;

const nonEmpty = (v: string | undefined): string | undefined => (v !== undefined && v.trim() !== "" ? v : undefined);

/** Pure merge: env (registry name, then legacy names) > stored > unset. */
export function buildConfig(input: { stored: StoredSetting[]; env: EnvSource }): AppConfig {
  const storedByKey = new Map(input.stored.map((s) => [s.key, s]));
  const raw: Record<string, string> = {};
  const sources: Record<string, "env" | "db"> = {};
  const problems: ConfigProblem[] = [];
  const undecryptable = input.stored.filter((s) => s.undecryptable).map((s) => s.key);

  for (const def of SETTINGS) {
    let candidate: string | undefined;
    let source: "env" | "db" | undefined;
    const fromEnv = nonEmpty(input.env[def.env]) ?? def.legacyEnv?.map((name) => nonEmpty(input.env[name])).find(Boolean);
    if (fromEnv !== undefined) {
      candidate = fromEnv;
      source = "env";
    } else {
      const row = storedByKey.get(def.key);
      if (row?.value !== undefined) {
        candidate = row.value;
        source = "db";
      }
    }
    if (candidate === undefined || !source) continue;
    const parsed = def.schema.safeParse(candidate);
    if (!parsed.success) {
      problems.push({ key: def.key, message: parsed.error.issues[0]?.message ?? "invalid value" });
      continue;
    }
    raw[def.key] = parsed.data;
    sources[def.key] = source;
  }

  // Legacy derivations (spec §8.2): a pre-M1 .env that only had DEEPSEEK_API_KEY
  // or RESEND_API_KEY keeps working with no edits.
  if (!raw["llm.provider"] && nonEmpty(input.env.DEEPSEEK_API_KEY) && !nonEmpty(input.env.LLM_API_KEY)) {
    raw["llm.provider"] = "deepseek";
    sources["llm.provider"] = "env";
  }
  if (!raw["email.provider"] && nonEmpty(input.env.RESEND_API_KEY)) {
    raw["email.provider"] = "resend";
    sources["email.provider"] = "env";
  }

  return finalizeConfig(raw, { sources, problems, undecryptable });
}

/** Registry keys the environment currently overrides (for the read-only badge). */
export function envOverriddenKeys(env: EnvSource = process.env): string[] {
  return SETTINGS.filter((def) => nonEmpty(env[def.env]) !== undefined || def.legacyEnv?.some((n) => nonEmpty(env[n]) !== undefined)).map((d) => d.key);
}

let warnedProblems = false;

/**
 * The merged config. Cached for 30 s in this process; `fresh: true` bypasses
 * the cache (the worker and Test-connection always do). Schema problems are
 * logged once per process, never thrown — a bad value is simply unset.
 */
export async function getConfig(db: any, opts?: { fresh?: boolean }): Promise<AppConfig> {
  if (!opts?.fresh) {
    const cached = getCachedConfig<AppConfig>();
    if (cached) return cached;
  }
  const env = loadEnv();
  const stored = await readAllSettings(db, keyFromEnv(env));
  const cfg = buildConfig({ stored, env: process.env });
  if (!warnedProblems && (cfg.problems.length || cfg.undecryptable.length)) {
    warnedProblems = true;
    for (const p of cfg.problems) console.warn(`[config] ${p.key}: ${p.message} — treated as unset`);
    for (const k of cfg.undecryptable) console.warn(`[config] ${k}: stored value could not be decrypted — re-enter it in Settings → Integrations`);
  }
  setCachedConfig(cfg);
  return cfg;
}
