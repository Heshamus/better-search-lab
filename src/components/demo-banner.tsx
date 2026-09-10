"use client";

import { useDemo } from "@/components/demo-provider";
import { REPO_URL } from "@/lib/repo";

export function DemoBanner() {
  if (!useDemo()) return null;
  return (
    <div role="note" className="flex flex-wrap items-center justify-center gap-x-2 border-b border-neutral-200 bg-neutral-50 px-4 py-1.5 text-center text-xs text-neutral-700">
      <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-[--color-accent]" />
      <span>Read-only demo with synthetic data — every write is disabled.</span>
      <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-neutral-900 underline underline-offset-2">Install your own →</a>
    </div>
  );
}
