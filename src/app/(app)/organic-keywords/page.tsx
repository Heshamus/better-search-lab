import { cookies } from "next/headers";
import { db } from "@/db/client";
import { getCurrentProject } from "@/lib/current-project";
import { getOrganicKeywords } from "@/lib/organic-keywords-store";
import { EmptyState } from "@/components/empty-state";
import { OrganicKeywordsTable } from "@/components/organic-keywords-table";
import { RunOrganicKeywordsButton } from "@/components/run-organic-keywords-button";

export const dynamic = "force-dynamic";

export default async function OrganicKeywordsPage() {
  const project = await getCurrentProject(db, (await cookies()).get("sp_project")?.value);
  if (!project) {
    return <EmptyState title="Create your first project in Settings" description="Add your site's domain in Settings to see the keywords it ranks for." />;
  }
  const { rows, capturedAt } = await getOrganicKeywords(db, project.id);

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Organic Keywords</div>
          <p className="mt-1 text-sm text-neutral-400">
            Every keyword <span className="font-medium text-neutral-200">{project.domain}</span> ranks for in Google.
          </p>
        </div>
        <RunOrganicKeywordsButton projectId={project.id} />
      </div>
      {rows.length === 0 ? (
        <div className="panel flex flex-col items-center gap-3 px-6 py-14 text-center">
          <p className="text-base font-semibold text-white">No organic keywords yet</p>
          <p className="max-w-sm text-sm text-neutral-400">Hit “Refresh organic keywords” to pull everything your domain ranks for (top 1,000 by volume).</p>
        </div>
      ) : (
        <OrganicKeywordsTable projectId={project.id} defaultLocationCode={project.defaultLocationCode} defaultLanguageCode={project.defaultLanguageCode} rows={rows} capturedAt={capturedAt} />
      )}
    </div>
  );
}
