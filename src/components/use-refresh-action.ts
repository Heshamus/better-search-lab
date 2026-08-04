"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type RefreshActionState = "idle" | "busy" | "error";

/**
 * The shared trigger behind the manual "refresh" buttons (refresh-rankings,
 * refresh-gaps, refresh-data): POST a list of routes SEQUENTIALLY, stop at the
 * FIRST non-2xx (or a thrown fetch) with an inline error, and only
 * `router.refresh()` the server-rendered page once every POST succeeds — never
 * a fabricated success. Single-route buttons pass a one-element array; the
 * full-pipeline button passes all three in dependency order (each later job
 * reads what the earlier ones produce, so order matters and they must not run
 * in parallel).
 *
 * `stepIndex` is the index of the path currently in flight while `state` is
 * "busy" (else null), so a caller with per-step progress copy (refresh-data's
 * "Refreshing rankings…" -> "Finding gaps…" -> …) can label the button without
 * the hook owning that copy. Buttons with a single busy label ignore it.
 */
export function useRefreshAction(paths: string[]): {
  state: RefreshActionState;
  stepIndex: number | null;
  run: () => Promise<void>;
} {
  const router = useRouter();
  const [state, setState] = useState<RefreshActionState>("idle");
  const [stepIndex, setStepIndex] = useState<number | null>(null);

  async function run() {
    setState("busy");
    try {
      for (let i = 0; i < paths.length; i++) {
        setStepIndex(i);
        const res = await fetch(paths[i], { method: "POST" });
        if (!res.ok) {
          setState("error");
          setStepIndex(null);
          return;
        }
      }
      setState("idle");
      setStepIndex(null);
      router.refresh();
    } catch {
      // Network error (fetch rejected) — same honest error as !res.ok.
      setState("error");
      setStepIndex(null);
    }
  }

  return { state, stepIndex, run };
}
