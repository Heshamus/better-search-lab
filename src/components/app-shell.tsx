"use client";

import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { AppNav, NAV } from "@/components/app-nav";
import { SiteSwitcher } from "@/components/site-switcher";
import { Logo } from "@/components/icons";

// The client half of the dashboard frame. The active nav slug comes from
// usePathname() (a shared layout has no server-side way to know which child
// rendered it); the session check lives in the server layout that mounts this.
const VALID_SLUGS: Set<string> = new Set(NAV.map(([slug]) => slug));

function activeSlugFromPathname(pathname: string | null): string {
  const firstSegment = pathname?.split("/").filter(Boolean)[0] ?? "";
  return VALID_SLUGS.has(firstSegment) ? firstSegment : "overview";
}

export function AppShell({ user, children }: { user: { email: string; role: "admin" | "member" }; children: React.ReactNode }) {
  const active = activeSlugFromPathname(usePathname());
  const activeLabel = NAV.find(([slug]) => slug === active)?.[1] ?? "";

  return (
    <div className="flex min-h-dvh text-neutral-100">
      <aside className="sticky top-0 flex h-dvh w-60 shrink-0 flex-col border-r border-neutral-800/70 bg-neutral-900/40 px-3 py-5 backdrop-blur-xl">
        <div className="mb-7 flex items-center gap-2.5 px-2">
          <Logo />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight text-white">Better Search Lab</div>
            <div className="text-[0.65rem] font-medium tracking-wide text-neutral-500">SEARCH &amp; GEO VISIBILITY</div>
          </div>
        </div>

        <AppNav active={active} />

        <div className="mt-auto flex flex-col gap-2 px-3 pt-5">
          <div className="min-w-0">
            <div className="truncate text-xs font-medium text-neutral-300">{user.email}</div>
            <div className="eyebrow text-[0.6rem]">{user.role}</div>
          </div>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="self-start rounded-lg border border-neutral-700 px-2.5 py-1 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-800/60"
          >
            Sign out
          </button>
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
