"use client";

import { useDemo } from "@/components/demo-provider";
import { REPO_URL } from "@/lib/repo";

export function DemoBanner() {
  if (!useDemo()) return null;
  return (
    <div role="note" className="flex flex-wrap items-center justify-center gap-x-2 border-b border-accent/30 bg-accent/10 px-4 py-1.5 text-center text-xs text-neutral-200">
      <span>Read-only demo with synthetic data — every write is disabled.</span>
      <a href={REPO_URL} className="font-medium text-accent underline-offset-2 hover:underline">Install your own →</a>
    </div>
  );
}
