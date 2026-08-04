import { cookies } from "next/headers";
import { db } from "@/db/client";
import { getCurrentProject } from "@/lib/current-project";
import { latestAudit } from "@/lib/audit/store";
import { EmptyState } from "@/components/empty-state";
import { AuditReport } from "@/components/audit-report";
import { RunAuditButton } from "@/components/run-audit-button";

// Reads the DB via cookies() per request — force-dynamic skips the build-time
// static pass (no DB then). The route was already ƒ Dynamic.
export const dynamic = "force-dynamic";

function timeAgo(d: Date): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default async function AuditPage() {
  const project = await getCurrentProject(db, (await cookies()).get("sp_project")?.value);

  if (!project) {
    return (
      <EmptyState
        title="Create your first project in Settings"
        description="Add your site's domain in Settings to run a site audit."
      />
    );
  }

  const audit = await latestAudit(db, project.id);

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Site audit</div>
          <p className="mt-1 text-sm text-neutral-400">
            On-page technical SEO for <span className="font-medium text-neutral-200">{project.domain}</span>
            {audit ? ` — ${audit.pagesCrawled} pages · ${timeAgo(audit.createdAt)}` : ""}.
          </p>
        </div>
        <RunAuditButton projectId={project.id} label={audit ? "Re-run audit" : "Run audit"} />
      </div>

      {audit ? (
        <AuditReport audit={audit} />
      ) : (
        <EmptyState
          title="No audit yet"
          description="Run a site audit to crawl your pages and score their on-page SEO — it's free and takes under a minute."
        />
      )}
    </div>
  );
}
