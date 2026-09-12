"use client";

import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { AppNav, NAV } from "@/components/app-nav";
import { SiteSwitcher } from "@/components/site-switcher";
import { Logo } from "@/components/icons";
import { UpdateBanner } from "@/components/update-banner";
import { FirstRunCard } from "@/components/first-run-card";
import { useDemo } from "@/components/demo-provider";
import type { UpdateState } from "@/lib/lifecycle/state";

// The client half of the dashboard frame. The active nav slug comes from
// usePathname() (a shared layout has no server-side way to know which child
// rendered it); the session check lives in the server layout that mounts this.
// `{children}` arrives already rendered by the server layout, so this client
// boundary frames the pages without pulling any of them into the client bundle.
const VALID_SLUGS: Set<string> = new Set(NAV.map(([slug]) => slug));

function activeSlugFromPathname(pathname: string | null): string {
  const firstSegment = pathname?.split("/").filter(Boolean)[0] ?? "";
  return VALID_SLUGS.has(firstSegment) ? firstSegment : "overview";
}

export function AppShell({
  user,
  update,
  children,
}: {
  user: { email: string; role: "admin" | "member" };
  update?: UpdateState;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const demo = useDemo();
  const active = activeSlugFromPathname(usePathname());
  const activeLabel = NAV.find(([slug]) => slug === active)?.[1] ?? "";

  return (
    <div className="flex min-h-dvh text-neutral-900">
      <aside className="sticky top-0 flex h-dvh w-60 shrink-0 flex-col border-r border-neutral-200 bg-white px-3 py-5">
        <div className="mb-7 flex items-center gap-2.5 px-2">
          <Logo />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight text-neutral-900">Better Search Lab</div>
            <div className="text-[0.65rem] font-medium tracking-wide text-neutral-500">SEARCH &amp; GEO VISIBILITY</div>
          </div>
        </div>

        <AppNav active={active} />

        <div className="mt-auto flex flex-col gap-2 px-3 pt-5">
          <div className="min-w-0">
            <div className="truncate text-xs font-medium text-neutral-700">{user.email}</div>
            <div className="eyebrow text-[0.6rem]">{user.role}</div>
          </div>
          <button
            type="button"
            // Sign out client-side and navigate ourselves: Auth.js's own
            // redirect builds its target from the origin the server sees,
            // which inside a container is http://localhost:3000 — a browser
            // error page for anyone outside it.
            onClick={async () => {
              await signOut({ redirect: false });
              router.push("/login");
              router.refresh();
            }}
            className="self-start rounded-lg border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white/80 px-7 py-3.5 backdrop-blur">
          <h1 className="text-[0.95rem] font-semibold tracking-tight text-neutral-900">{activeLabel}</h1>
          <SiteSwitcher />
        </header>

        {user.role === "admin" && update?.available && !update.bannerDismissed && update.latest ? (
          <UpdateBanner current={update.current} latest={update.latest} url={update.url} />
        ) : null}

        <main className="mx-auto w-full max-w-[1440px] flex-1 px-7 py-7">
          {user.role === "admin" && update?.firstRunPending && !demo ? <FirstRunCard /> : null}
          {children}
        </main>
      </div>
    </div>
  );
}
