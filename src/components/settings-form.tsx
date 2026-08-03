"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DEFAULT_WEIGHTS, type Weights } from "@/lib/core/scoring";

const WEIGHT_KEYS = ["volume", "winnability", "position", "trend", "relevance"] as const;

const WEIGHT_LABELS: Record<(typeof WEIGHT_KEYS)[number], string> = {
  volume: "Volume",
  winnability: "Winnability",
  position: "Position",
  trend: "Trend",
  relevance: "Relevance",
};

type SaveState = "idle" | "busy" | "done" | "error";

const inputClass =
  "rounded-lg border border-neutral-200 bg-white px-2 py-1 text-sm text-neutral-900 outline-none focus:border-accent dark:border-neutral-700 dark:bg-neutral-950 dark:text-white";

/**
 * Settings screen's per-project tuning form (Task 9): the five
 * `scoreOpportunity` blend weights (volume/winnability/position/trend/
 * relevance) plus the refresh cadence. Pre-fills from the project's saved
 * `opportunityWeights`, falling back to `DEFAULT_WEIGHTS` when the project
 * has never been tuned (`opportunityWeights` is null) — the same fallback
 * `assembleOpportunities`/`weeklyOpportunitiesHandler` use server-side.
 *
 * CRITICAL guardrail: `POST /api/projects/[id]/settings` and
 * `scoreOpportunity` do no shape-checking on `opportunityWeights` — a
 * partial object or null would silently produce NaN scores or a 500. So
 * `handleSubmit` always builds and posts the COMPLETE 5-key object (every
 * value coerced through `Number(...) || 0`, never left as a string and
 * never NaN), regardless of which single input the user actually edited.
 * The live sum is shown as a non-blocking hint only — weights need not sum
 * to exactly 1.0 to save.
 */
export function SettingsForm({
  projectId,
  weights,
  cadence,
}: {
  projectId: string;
  weights: Record<string, number> | null;
  cadence: string;
}) {
  const router = useRouter();
  const initial = (weights as Weights | null) ?? DEFAULT_WEIGHTS;

  const [values, setValues] = useState<Record<(typeof WEIGHT_KEYS)[number], string>>({
    volume: String(initial.volume ?? DEFAULT_WEIGHTS.volume),
    winnability: String(initial.winnability ?? DEFAULT_WEIGHTS.winnability),
    position: String(initial.position ?? DEFAULT_WEIGHTS.position),
    trend: String(initial.trend ?? DEFAULT_WEIGHTS.trend),
    relevance: String(initial.relevance ?? DEFAULT_WEIGHTS.relevance),
  });
  const [selectedCadence, setSelectedCadence] = useState(cadence);
  const [state, setState] = useState<SaveState>("idle");

  const sum = WEIGHT_KEYS.reduce((acc, key) => acc + (Number(values[key]) || 0), 0);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setState("busy");
    try {
      const opportunityWeights: Record<string, number> = {};
      for (const key of WEIGHT_KEYS) {
        opportunityWeights[key] = Number(values[key]) || 0;
      }

      const res = await fetch(`/api/projects/${projectId}/settings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ opportunityWeights, refreshCadence: selectedCadence }),
      });
      if (!res.ok) {
        setState("error");
        return;
      }
      setState("done");
      router.refresh();
    } catch {
      // Network error (fetch rejected) — same honest error as !res.ok.
      setState("error");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        Opportunity weights
      </h2>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {WEIGHT_KEYS.map((key) => (
          <div key={key} className="flex flex-col gap-1">
            <label htmlFor={`weight-${key}`} className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              {WEIGHT_LABELS[key]}
            </label>
            <input
              id={`weight-${key}`}
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={values[key]}
              onChange={(event) => setValues((prev) => ({ ...prev, [key]: event.target.value }))}
              className={inputClass}
            />
          </div>
        ))}
      </div>

      <p className="text-xs text-neutral-400 dark:text-neutral-600">Weights sum: {sum.toFixed(2)}</p>

      <div className="flex flex-col gap-1">
        <label htmlFor="refresh-cadence" className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
          Refresh cadence
        </label>
        <select
          id="refresh-cadence"
          value={selectedCadence}
          onChange={(event) => setSelectedCadence(event.target.value)}
          className={`w-40 ${inputClass}`}
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
      </div>

      {state === "error" ? <p className="text-xs text-at-risk">Couldn&rsquo;t save — try again.</p> : null}
      {state === "done" ? <p className="text-xs text-accent">Saved.</p> : null}

      <button
        type="submit"
        disabled={state === "busy"}
        className="self-start rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-neutral-900 transition-opacity disabled:cursor-default disabled:opacity-50"
      >
        {state === "busy" ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
