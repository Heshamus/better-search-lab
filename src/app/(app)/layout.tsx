"use client";

import { usePathname } from "next/navigation";
import { AppNav, NAV } from "@/components/app-nav";
import { SiteSwitcher } from "@/components/site-switcher";

// Next.js layouts aren't re-invoked per-route with the current path — a
// shared layout has no server-side way to know which child page rendered
// it. Deriving the active nav slug from `usePathname()` is the standard
// App Router pattern for this, which is why this file (unlike `<AppNav>`
// itself) needs to be a client component. `{children}` is unaffected: React
// keeps whatever the server already rendered for the page content, a client
// boundary here doesn't pull page components (opportunities/rankings/...)
// into the client bundle.
//
// Widened to Set<string> deliberately: `firstSegment` below is derived from
// an arbitrary URL, not one of NAV's literal slugs, so `.has()` needs to
// accept any string rather than the narrow union `NAV`'s `as const` infers.
const VALID_SLUGS: Set<string> = new Set(NAV.map(([slug]) => slug));

function activeSlugFromPathname(pathname: string | null): string {
  const firstSegment = pathname?.split("/").filter(Boolean)[0] ?? "";
  return VALID_SLUGS.has(firstSegment) ? firstSegment : "opportunities";
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const active = activeSlugFromPathname(usePathname());
  const activeLabel = NAV.find(([slug]) => slug === active)?.[1] ?? "";

  return (
    <div className="flex min-h-dvh bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
      <aside className="flex w-56 shrink-0 flex-col border-r border-neutral-200 bg-white px-3 py-5 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-6 flex items-center gap-2 px-2">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-accent" />
          <span className="text-sm font-semibold tracking-tight">SEO Platform</span>
        </div>
        <AppNav active={active} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-3 dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-sm font-medium text-neutral-500 dark:text-neutral-400">{activeLabel}</span>
          <SiteSwitcher />
        </header>

        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
