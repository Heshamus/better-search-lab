import { GROUPS } from "@/lib/config/registry";

/** Integrations in demo mode (spec §13): every group reads as connected, no fields, no secrets to leak. */
export function DemoIntegrations() {
  return (
    <ul className="flex flex-col gap-3">
      {GROUPS.filter((g) => !g.hidden).map((g) => (
        <li key={g.id} className="panel flex items-center justify-between gap-3 p-4">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">{g.label}</h2>
            <p className="text-xs text-neutral-500">{g.description}</p>
          </div>
          <span className="rounded-full bg-[--color-accent-tint] px-2 py-0.5 text-[0.7rem] font-medium text-accent">Connected (demo)</span>
        </li>
      ))}
    </ul>
  );
}
