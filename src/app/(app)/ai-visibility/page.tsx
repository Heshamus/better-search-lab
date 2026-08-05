import { cookies } from "next/headers";
import { db } from "@/db/client";
import { getCurrentProject } from "@/lib/current-project";
import { loadEnv } from "@/config/env";
import { getLatestScan, getScanHistory } from "@/lib/ai-visibility/store";
import { EmptyState } from "@/components/empty-state";
import { AiVisibilityDashboard } from "@/components/ai-visibility-dashboard";
import { RunAiVisibilityButton } from "@/components/run-ai-visibility-button";

export const dynamic = "force-dynamic";

const bareDomain = (d: string): string => d.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");

function ScanPanel({ projectId }: { projectId: string }) {
  return (
    <div className="panel flex flex-col items-center gap-4 px-6 py-16 text-center">
      <div aria-hidden className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10z" />
        </svg>
      </div>
      <h1 className="text-lg font-semibold text-white">Measure your AI visibility</h1>
      <p className="max-w-md text-sm text-neutral-400">
        See whether Perplexity, ChatGPT and Gemini cite your site when people ask buying questions in your niche —
        across your real Search Console queries plus generated buyer questions.
      </p>
      <RunAiVisibilityButton projectId={projectId} />
    </div>
  );
}

export default async function AiVisibilityPage() {
  const project = await getCurrentProject(db, (await cookies()).get("sp_project")?.value);
  if (!project) {
    return <EmptyState title="Create your first project in Settings" description="Add your site's domain in Settings to measure AI visibility." />;
  }

  const env = loadEnv();
  const configured = Boolean(env.EDENAI_API_KEY);
  const latest = configured ? await getLatestScan(db, project.id) : null;
  const history = latest ? await getScanHistory(db, project.id, 30) : [];

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">AI Visibility</div>
          <p className="mt-1 text-sm text-neutral-400">
            Are AI engines citing <span className="font-medium text-neutral-200">{project.domain}</span>?
          </p>
        </div>
        {latest ? <RunAiVisibilityButton projectId={project.id} label="Re-scan" /> : null}
      </div>

      {!configured ? (
        <EmptyState title="AI Visibility isn't configured" description="This instance needs an Eden AI key before AI visibility can be measured." />
      ) : !latest ? (
        <ScanPanel projectId={project.id} />
      ) : (
        <AiVisibilityDashboard latest={latest} history={history} projectDomain={bareDomain(project.domain)} />
      )}
    </div>
  );
}
