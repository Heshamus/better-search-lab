import { NAV_ICONS } from "@/components/icons";

// The dashboard's left-nav — the tool's map. Server-renderable (no hooks) so it
// stays cheap to render and unit-test. `NAV` is exported so the layout derives
// valid slugs + the active label without duplicating this list.
export const NAV = [
  ["opportunities", "Opportunities"],
  ["rankings", "Rankings"],
  ["keywords", "Keywords"],
  ["research", "Research"],
  ["competitors", "Competitors"],
  ["audit", "Site audit"],
  ["usage", "Usage & cost"],
  ["settings", "Settings"],
] as const;

// Rendering groups: the analysis views, then the account views. Grouping encodes
// what the sections are FOR, not just an alphabetical list.
const GROUPS: { heading: string; slugs: string[] }[] = [
  { heading: "Analyze", slugs: ["opportunities", "rankings", "keywords", "research", "competitors", "audit"] },
  { heading: "Account", slugs: ["usage", "settings"] },
];
const LABELS: Record<string, string> = Object.fromEntries(NAV);

export function AppNav({ active }: { active: string }) {
  return (
    <nav aria-label="Primary" className="flex flex-col gap-6">
      {GROUPS.map((group) => (
        <div key={group.heading} className="flex flex-col gap-1">
          <span className="eyebrow px-3 pb-1">{group.heading}</span>
          {group.slugs.map((slug) => {
            const Icon = NAV_ICONS[slug];
            const isActive = active === slug;
            return (
              <a
                key={slug}
                href={`/${slug}`}
                aria-current={isActive ? "page" : undefined}
                className={`group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-accent/10 font-medium text-white"
                    : "font-medium text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-100"
                }`}
              >
                {isActive ? (
                  <span aria-hidden className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent" />
                ) : null}
                <Icon className={isActive ? "text-accent" : "text-neutral-500 transition-colors group-hover:text-neutral-300"} />
                {LABELS[slug]}
              </a>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
