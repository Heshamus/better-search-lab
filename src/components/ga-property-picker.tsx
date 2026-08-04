"use client";

import { useMemo, useState } from "react";
import { useJob } from "@/components/use-job";
import type { GaProperty } from "@/lib/google/analytics";

// Lets the user map one of their GA4 properties to this project (GA4 properties
// carry no domain, so unlike GSC we can't auto-match). Grouped by account.
export function GaPropertyPicker({ projectId, properties }: { projectId: string; properties: GaProperty[] }) {
  const [selected, setSelected] = useState(properties[0]?.propertyId ?? "");
  const job = useJob();

  const groups = useMemo(() => {
    const byAccount = new Map<string, GaProperty[]>();
    for (const p of properties) {
      const arr = byAccount.get(p.account) ?? [];
      arr.push(p);
      byAccount.set(p.account, arr);
    }
    return [...byAccount.entries()];
  }, [properties]);

  return (
    <div className="panel flex flex-col items-center gap-4 px-6 py-14 text-center">
      <div aria-hidden className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 20V9M12 20V4M19 20v-7" />
        </svg>
      </div>
      <div>
        <h1 className="text-lg font-semibold text-white">Choose your Analytics property</h1>
        <p className="mx-auto mt-1 max-w-sm text-sm text-neutral-400">
          GA4 properties don&rsquo;t carry a domain, so pick the one that tracks this site.
        </p>
      </div>

      <label className="w-full max-w-sm text-left">
        <span className="eyebrow">GA4 property</span>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          disabled={job.state === "running"}
          className="mt-1.5 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-accent"
        >
          {groups.map(([account, props]) => (
            <optgroup key={account || "—"} label={account || "Account"}>
              {props.map((p) => (
                <option key={p.propertyId} value={p.propertyId}>
                  {p.displayName} · {p.propertyId}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={() => selected && void job.run(`/api/projects/${projectId}/ga/property`, { body: { propertyId: selected } })}
        disabled={job.state === "running" || !selected}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-neutral-900 transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-50"
      >
        {job.state === "running" ? "Connecting…" : "Use this property"}
      </button>
      <span role="status" aria-live="polite" className="text-xs text-at-risk">
        {job.error ?? null}
      </span>
    </div>
  );
}
