import { KeywordOverview } from "@/components/keyword-overview";

// Project-agnostic — no project row is read. Live-on-demand only.
//
// force-dynamic like every other (app) page: the group's layout resolves the
// session on each render, and a statically prerendered shell here would be
// served from the full route cache without that check ever running.
export const dynamic = "force-dynamic";

export default function KeywordOverviewPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-white">Keyword Overview</h2>
        <p className="text-sm text-neutral-400">Bulk volume, difficulty and 12-month trend for any list of keywords. Nothing is saved.</p>
      </div>
      <KeywordOverview />
    </div>
  );
}
