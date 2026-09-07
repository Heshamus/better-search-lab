import { loadEnv } from "@/config/env";
import { GROUPS, SETTINGS, type SettingGroupId } from "./registry";
import { keyFromEnv } from "./crypto";
import { readAllSettings } from "./store";
import { buildConfig, envOverriddenKeys } from "./resolve";
import type { AppConfig } from "./app-config";

export interface IntegrationFieldView {
  key: string;
  /** The env var that overrides this setting (shown on the read-only badge). */
  env: string;
  label: string;
  description: string;
  secret: boolean;
  set: boolean;
  source: "env" | "db" | null;
  /** Non-secret values only; a secret is never echoed. */
  value?: string;
  options?: readonly string[];
  placeholder?: string;
  problem?: string;
  undecryptable: boolean;
}

export interface IntegrationGroupView {
  id: SettingGroupId;
  label: string;
  description: string;
  configured: boolean;
  fields: IntegrationFieldView[];
}

export interface IntegrationsView {
  groups: IntegrationGroupView[];
}

const configuredOf = (cfg: AppConfig, id: SettingGroupId): boolean => cfg[id].configured;

/** What the Integrations page and its GET route render. Always a fresh read. */
export async function buildIntegrationsView(db: any): Promise<IntegrationsView> {
  const env = loadEnv();
  const stored = await readAllSettings(db, keyFromEnv(env));
  const cfg = buildConfig({ stored, env: process.env });
  const storedByKey = new Map(stored.map((s) => [s.key, s]));
  const envKeys = new Set(envOverriddenKeys());
  const problems = new Map(cfg.problems.map((p) => [p.key, p.message]));

  const groups = GROUPS.filter((g) => !g.hidden).map((g) => ({
    id: g.id,
    label: g.label,
    description: g.description,
    configured: configuredOf(cfg, g.id),
    fields: SETTINGS.filter((s) => s.group === g.id).map((s): IntegrationFieldView => {
      const row = storedByKey.get(s.key);
      const fromEnv = envKeys.has(s.key);
      const envValue = fromEnv ? (process.env[s.env] || s.legacyEnv?.map((n) => process.env[n]).find(Boolean)) : undefined;
      const set = fromEnv || (!!row && row.value !== undefined);
      const source: "env" | "db" | null = fromEnv ? "env" : row ? "db" : null;
      const value = s.secret ? undefined : fromEnv ? envValue : row?.value;
      return {
        key: s.key, env: s.env, label: s.label, description: s.description, secret: s.secret,
        set, source, value: value || undefined, options: s.options, placeholder: s.placeholder,
        problem: problems.get(s.key), undecryptable: !!row?.undecryptable && !fromEnv,
      };
    }),
  }));
  return { groups };
}
