"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LLM_PRESETS, type LlmProviderId } from "@/lib/config/registry";
import type { IntegrationFieldView, IntegrationGroupView, IntegrationsView } from "@/lib/config/view";

const inputClass =
  "w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-accent disabled:cursor-not-allowed disabled:opacity-60";
const buttonClass =
  "rounded-lg border border-neutral-700 px-2.5 py-1 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-800/60 disabled:cursor-default disabled:opacity-50";

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    return j.error || fallback;
  } catch {
    return fallback;
  }
}

function Field({
  field, value, revealed, onChange, onReveal, models,
}: {
  field: IntegrationFieldView; value: string; revealed: boolean; onChange: (v: string) => void; onReveal: () => void; models?: string[];
}) {
  const id = `f-${field.key.replace(/\./g, "-")}`;
  const disabled = field.source === "env";
  const maskedSecret = field.secret && field.set && !revealed && !disabled;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="eyebrow">{field.label}</label>
        {disabled ? <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[0.62rem] font-medium text-neutral-400">set via {field.env}</span> : null}
      </div>
      {maskedSecret ? (
        <div className="flex items-center gap-2">
          <span className="tnum text-sm text-neutral-400">•••••••• set</span>
          <button type="button" className={buttonClass} onClick={onReveal}>Replace</button>
        </div>
      ) : field.options ? (
        <select id={id} className={inputClass} disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <>
          <input
            id={id}
            type={field.secret ? "password" : "text"}
            className={inputClass}
            disabled={disabled}
            placeholder={field.placeholder}
            list={models ? `${id}-models` : undefined}
            autoComplete="off"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          {models ? <datalist id={`${id}-models`}>{models.map((m) => <option key={m} value={m} />)}</datalist> : null}
        </>
      )}
      {field.description ? <span className="text-[0.7rem] text-neutral-500">{field.description}</span> : null}
      {/* DEVIATION: brief's wording ("could not be decrypted") breaks the test's /could not decrypt/i match — rephrased to keep the substring contiguous. */}
      {field.undecryptable ? <span className="text-[0.7rem] text-at-risk">Could not decrypt the stored value — re-enter it.</span> : null}
      {field.problem ? <span className="text-[0.7rem] text-at-risk">{field.problem}</span> : null}
    </div>
  );
}

function GroupCard({ group }: { group: IntegrationGroupView }) {
  const router = useRouter();
  const initial = Object.fromEntries(group.fields.map((f) => [f.key, f.secret ? "" : (f.value ?? "")]));
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<{ kind: "idle" | "saving" | "saved" | "testing" | "tested" | "error"; text?: string; ok?: boolean }>({ kind: "idle" });
  const [models, setModels] = useState<string[] | undefined>(undefined);

  function edit(key: string, v: string) {
    setValues((prev) => {
      const next = { ...prev, [key]: v };
      // The LLM provider preset fills base URL / model unless the person already typed their own.
      // Own-property checks: `in` also resolves prototype keys such as "constructor".
      if (key === "llm.provider" && Object.hasOwn(LLM_PRESETS, v)) {
        const preset = LLM_PRESETS[v as LlmProviderId];
        const prevPreset = Object.hasOwn(LLM_PRESETS, prev["llm.provider"]) ? LLM_PRESETS[prev["llm.provider"] as LlmProviderId] : undefined;
        if (!prev["llm.baseUrl"] || prev["llm.baseUrl"] === prevPreset?.baseUrl) next["llm.baseUrl"] = preset.baseUrl ?? "";
        if (!prev["llm.model"] || prev["llm.model"] === prevPreset?.defaultModel) next["llm.model"] = preset.defaultModel;
        setDirty((d) => new Set([...d, "llm.baseUrl", "llm.model"]));
      }
      return next;
    });
    setDirty((d) => new Set([...d, key]));
  }

  async function save() {
    const payload: Record<string, string | null> = {};
    for (const key of dirty) payload[key] = values[key] === "" ? null : values[key];
    if (Object.keys(payload).length === 0) return;
    setStatus({ kind: "saving" });
    try {
      const res = await fetch("/api/settings/integrations", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ values: payload }) });
      if (!res.ok) {
        setStatus({ kind: "error", text: await readError(res, "Could not save.") });
        return;
      }
      setDirty(new Set());
      setStatus({ kind: "saved", text: "Saved." });
      if (group.id === "llm") {
        const m = await fetch("/api/settings/integrations/llm/models").then((r) => (r.ok ? r.json() : { models: [] })).catch(() => ({ models: [] }));
        setModels(Array.isArray(m.models) ? m.models : []);
      }
      router.refresh();
    } catch {
      setStatus({ kind: "error", text: "Network error — please try again." });
    }
  }

  async function test() {
    setStatus({ kind: "testing" });
    try {
      const res = await fetch(`/api/settings/integrations/${group.id}/test`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; detail?: string; error?: string };
      if (!res.ok) {
        setStatus({ kind: "error", text: body.error ?? "Test failed." });
        return;
      }
      setStatus({ kind: "tested", ok: !!body.ok, text: body.detail ?? (body.ok ? "OK" : "Failed") });
    } catch {
      setStatus({ kind: "error", text: "Network error — please try again." });
    }
  }

  const busy = status.kind === "saving" || status.kind === "testing";

  return (
    <section id={group.id} data-testid={`integration-${group.id}`} className="panel flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">{group.label}</h2>
          <p className="text-xs text-neutral-500">{group.description}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[0.7rem] font-medium ${group.configured ? "bg-accent/12 text-accent" : "bg-neutral-800 text-neutral-400"}`}>
          {group.configured ? "Connected" : "Not connected"}
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {group.fields.map((f) => (
          <Field
            key={f.key}
            field={f}
            value={values[f.key] ?? ""}
            revealed={revealed.has(f.key)}
            onChange={(v) => edit(f.key, v)}
            onReveal={() => setRevealed((r) => new Set([...r, f.key]))}
            models={f.key === "llm.model" ? models : undefined}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void save()} disabled={busy || dirty.size === 0} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-neutral-900 disabled:opacity-50">
          {status.kind === "saving" ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => void test()} disabled={busy} className={buttonClass}>
          {status.kind === "testing" ? "Testing…" : "Test"}
        </button>
        {status.kind === "saved" ? <span className="text-xs text-up">{status.text}</span> : null}
        {status.kind === "tested" ? <span className={`text-xs ${status.ok ? "text-up" : "text-at-risk"}`}>{status.text}</span> : null}
        {status.kind === "error" ? <span role="alert" className="text-xs text-at-risk">{status.text}</span> : null}
      </div>
    </section>
  );
}

export function IntegrationsForm({ view }: { view: IntegrationsView }) {
  return (
    <div className="flex flex-col gap-5">
      {view.groups.map((g) => <GroupCard key={g.id} group={g} />)}
    </div>
  );
}
