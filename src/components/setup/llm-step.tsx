"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LLM_PRESETS, LLM_PROVIDERS, type LlmProviderId } from "@/lib/config/presets";

const inputClass = "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-400";
const secondaryButton = "rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-50";

async function readError(res: Response, fallback: string): Promise<string> {
  try { const j = (await res.json()) as { error?: string }; return j.error || fallback; } catch { return fallback; }
}

/** Step 3 (spec §11.1): optional. Preset → key → model → Test; Skip never shows the step again. */
export function LlmStep() {
  const router = useRouter();
  const [provider, setProvider] = useState<LlmProviderId | "">("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function choose(id: string) {
    if (!Object.hasOwn(LLM_PRESETS, id)) { setProvider(""); return; }
    const p = LLM_PRESETS[id as LlmProviderId];
    setProvider(id as LlmProviderId);
    setBaseUrl(p.baseUrl ?? "");
    setModel(p.defaultModel);
  }

  async function recordStep(llmStep: "done" | "skipped") {
    const res = await fetch("/api/setup/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ llmStep }) });
    if (!res.ok) throw new Error(await readError(res, "Could not record the step."));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!provider) { setError("Choose a provider first."); return; }
    setBusy(true); setError(null);
    try {
      const values: Record<string, string> = { "llm.provider": provider, "llm.model": model };
      if (baseUrl) values["llm.baseUrl"] = baseUrl;
      if (apiKey) values["llm.apiKey"] = apiKey;
      const put = await fetch("/api/settings/integrations", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ values }) });
      if (!put.ok) { setError(await readError(put, "Could not save the settings.")); return; }
      const test = await fetch("/api/settings/integrations/llm/test", { method: "POST" });
      const body = (await test.json().catch(() => ({}))) as { ok?: boolean; detail?: string; error?: string };
      if (!test.ok || !body.ok) {
        // The test runs against the stored settings, so they were saved first;
        // a failed test must not leave them behind, or the install counts as
        // configured and the wizard skips this step next time.
        const cleared = Object.fromEntries(Object.keys(values).map((k) => [k, null]));
        await fetch("/api/settings/integrations", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ values: cleared }) }).catch(() => undefined);
        setError(body.detail ?? body.error ?? "The provider did not answer.");
        return;
      }
      await recordStep("done");
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Network error — please try again."); } finally { setBusy(false); }
  }

  async function skip() {
    setBusy(true); setError(null);
    try { await recordStep("skipped"); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Network error — please try again."); }
    finally { setBusy(false); }
  }

  const preset = provider ? LLM_PRESETS[provider] : null;
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <h1 className="text-base font-semibold text-neutral-900">Add an AI assistant (optional)</h1>
        <p className="mt-1 text-sm text-neutral-600">Used for niche extraction during profiling, phrasing the weekly actions, and the Reddit judge. Any OpenAI-compatible API, Anthropic, or a local Ollama. You can add or change it later under Settings → Integrations.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="llm-provider" className="eyebrow">Provider</label>
        <select id="llm-provider" className={inputClass} value={provider} onChange={(e) => choose(e.target.value)}>
          <option value="">—</option>
          {LLM_PROVIDERS.map((id) => <option key={id} value={id}>{LLM_PRESETS[id].label}</option>)}
        </select>
      </div>
      {preset && preset.kind === "openai-compatible" ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="llm-base-url" className="eyebrow">Base URL</label>
          <input id="llm-base-url" type="text" className={inputClass} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="llm-api-key" className="eyebrow">API key{preset && !preset.needsKey ? " (optional)" : ""}</label>
        <input id="llm-api-key" type="password" autoComplete="off" className={inputClass} value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="llm-model" className="eyebrow">Model</label>
        <input id="llm-model" type="text" className={inputClass} value={model} onChange={(e) => setModel(e.target.value)} />
      </div>
      {error ? <p role="alert" className="text-sm text-at-risk">{error}</p> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-[#2a3138] disabled:opacity-50">{busy ? "Testing…" : "Test & continue"}</button>
        <button type="button" disabled={busy} onClick={() => void skip()} className={secondaryButton}>Skip for now</button>
      </div>
    </form>
  );
}
