// The LLM provider presets, on their own and dependency-free: no zod, no node
// builtins, nothing that pulls the settings registry (and through it the whole
// config service) into a client bundle. `integrations-form.tsx` is a client
// component and only needs these constants; registry.ts re-exports them
// unchanged so every existing import keeps working.

export const LLM_PROVIDERS = ["deepseek", "openai", "anthropic", "openrouter", "groq", "together", "gemini", "ollama", "custom"] as const;
export type LlmProviderId = (typeof LLM_PROVIDERS)[number];

export interface LlmPreset {
  label: string;
  /** null → the adapter owns the endpoint (anthropic) or the user must supply it (custom). */
  baseUrl: string | null;
  defaultModel: string;
  needsKey: boolean;
  kind: "openai-compatible" | "anthropic";
}

/** Defaults a provider preset fills in; every value stays editable in the UI. */
export const LLM_PRESETS: Record<LlmProviderId, LlmPreset> = {
  deepseek: { label: "DeepSeek", baseUrl: "https://api.deepseek.com", defaultModel: "deepseek-chat", needsKey: true, kind: "openai-compatible" },
  openai: { label: "OpenAI", baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-5", needsKey: true, kind: "openai-compatible" },
  anthropic: { label: "Anthropic", baseUrl: null, defaultModel: "claude-opus-5", needsKey: true, kind: "anthropic" },
  openrouter: { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", defaultModel: "openai/gpt-5", needsKey: true, kind: "openai-compatible" },
  groq: { label: "Groq", baseUrl: "https://api.groq.com/openai/v1", defaultModel: "llama-3.3-70b-versatile", needsKey: true, kind: "openai-compatible" },
  together: { label: "Together", baseUrl: "https://api.together.xyz/v1", defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo", needsKey: true, kind: "openai-compatible" },
  gemini: { label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", defaultModel: "gemini-2.5-flash", needsKey: true, kind: "openai-compatible" },
  ollama: { label: "Ollama (local)", baseUrl: "http://localhost:11434/v1", defaultModel: "llama3.1", needsKey: false, kind: "openai-compatible" },
  custom: { label: "Custom OpenAI-compatible", baseUrl: null, defaultModel: "", needsKey: true, kind: "openai-compatible" },
};
