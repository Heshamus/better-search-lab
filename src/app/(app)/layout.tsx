"use client";

import { usePathname } from "next/navigation";
import { AppNav, NAV } from "@/components/app-nav";
import { SiteSwitcher } from "@/components/site-switcher";
import { Logo } from "@/components/icons";

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
  return VALID_SLUGS.has(firstSegment) ? firstSegment : "overview";
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const active = activeSlugFromPathname(usePathname());
  const activeLabel = NAV.find(([slug]) => slug === active)?.[1] ?? "";

  return (
    <div className="flex min-h-dvh text-neutral-100">
      <aside className="sticky top-0 flex h-dvh w-60 shrink-0 flex-col border-r border-neutral-800/70 bg-neutral-900/40 px-3 py-5 backdrop-blur-xl">
        <div className="mb-7 flex items-center gap-2.5 px-2">
          <Logo />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight text-white">SEO Platform</div>
            <div className="text-[0.65rem] font-medium tracking-wide text-neutral-500">SEARCH &amp; GEO VISIBILITY</div>
          </div>
        </div>

        <AppNav active={active} />

        <div className="mt-auto flex items-center gap-2 px-3 pt-5 text-[0.7rem] font-medium text-neutral-500">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-up shadow-[0_0_8px_1px] shadow-up/50" />
          All systems live
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-800/60 bg-neutral-950/70 px-7 py-3.5 backdrop-blur-xl">
          <h1 className="text-[0.95rem] font-semibold tracking-tight text-white">{activeLabel}</h1>
          <SiteSwitcher />
        </header>

        <main className="mx-auto w-full max-w-[1440px] flex-1 px-7 py-7">{children}</main>
      </div>
    </div>
  );
}
