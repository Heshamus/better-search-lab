import { NAV_ICONS } from "@/components/icons";

// The dashboard's left-nav — the tool's map. Server-renderable (no hooks) so it
// stays cheap to render and unit-test. `NAV` is exported so the layout derives
// valid slugs + the active label without duplicating this list.
export const NAV = [
  ["overview", "Overview"],
  ["opportunities", "Opportunities"],
  ["rankings", "Rankings"],
  ["keywords", "Keywords"],
  ["organic-keywords", "Organic Keywords"],
  ["research", "Research"],
  ["keyword-overview", "Keyword Overview"],
  ["competitors", "Competitors"],
  ["audit", "Site audit"],
  ["backlinks", "Backlinks"],
  ["gsc", "Search Console"],
  ["ga", "Analytics"],
  ["ai-visibility", "AI Visibility"],
  ["trends", "Trends"],
  ["usage", "Usage & cost"],
  ["settings", "Settings"],
] as const;

// Rendering groups: the analysis views, then the account views. Grouping encodes
// what the sections are FOR, not just an alphabetical list.
const GROUPS: { heading: string; slugs: string[] }[] = [
  { heading: "Analyze", slugs: ["overview", "opportunities", "rankings", "keywords", "organic-keywords", "research", "keyword-overview", "competitors", "audit", "backlinks", "gsc", "ga", "ai-visibility", "trends"] },
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
                    ? "bg-white font-semibold text-neutral-900 shadow-1"
                    : "font-medium text-neutral-700 hover:bg-neutral-100"
                }`}
              >
                <Icon className={isActive ? "text-neutral-900" : "text-neutral-500 transition-colors group-hover:text-neutral-700"} />
                {LABELS[slug]}
              </a>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
