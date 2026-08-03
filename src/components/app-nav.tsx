// The dashboard's left-nav — the tool's map. Exact 8 sections, in order
// (validated Hybrid design, spec §8). Deliberately a plain, prop-driven,
// server-renderable component (no hooks, no "use client") so it stays cheap
// to unit-test with @testing-library/react and cheap to render from the
// (app) layout. `NAV` is exported so the layout can derive the set of valid
// slugs (e.g. for pathname -> active-section matching) without duplicating
// this list.
export const NAV = [
  ["opportunities", "Opportunities"],
  ["rankings", "Rankings"],
  ["keywords", "Keywords"],
  ["research", "Research"],
  ["competitors", "Competitors"],
  ["content", "Content"],
  ["usage", "Usage & cost"],
  ["settings", "Settings"],
] as const;

export function AppNav({ active }: { active: string }) {
  return (
    <nav aria-label="Primary" className="flex flex-col gap-0.5">
      {NAV.map(([slug, label]) => {
        const isActive = active === slug;
        return (
          <a
            key={slug}
            href={`/${slug}`}
            aria-current={isActive ? "page" : undefined}
            className={
              isActive
                ? "rounded-lg bg-accent/20 px-3 py-2 text-sm font-medium text-neutral-900 dark:text-white"
                : "rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
            }
          >
            {label}
          </a>
        );
      })}
    </nav>
  );
}
