"use client";

import { usePathname } from "next/navigation";

const TABS: { href: string; label: string; adminOnly: boolean }[] = [
  { href: "/settings", label: "Project", adminOnly: false },
  { href: "/settings/integrations", label: "Integrations", adminOnly: true },
  { href: "/settings/users", label: "Users", adminOnly: true },
  { href: "/settings/mcp", label: "MCP", adminOnly: true },
  { href: "/settings/running", label: "Running & updates", adminOnly: true },
  { href: "/settings/account", label: "Account", adminOnly: false },
];

export function SettingsTabs({ role }: { role: "admin" | "member" }) {
  const pathname = usePathname() ?? "/settings";
  return (
    <nav aria-label="Settings sections" className="flex flex-wrap gap-1 border-b border-neutral-200 pb-2">
      {TABS.filter((t) => !t.adminOnly || role === "admin").map((t) => {
        const active = pathname === t.href;
        return (
          <a
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${active ? "bg-white font-semibold text-neutral-900 shadow-1" : "font-medium text-neutral-700 hover:bg-neutral-100"}`}
          >
            {t.label}
          </a>
        );
      })}
    </nav>
  );
}
