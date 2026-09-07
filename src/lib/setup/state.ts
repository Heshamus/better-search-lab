import { isOnboarded, readOnboarding } from "./onboarding";

export type SetupStepId = "account" | "dataforseo" | "llm" | "site" | "profile" | "competitors" | "build" | "done";

export interface ProjectRow { id: string; name: string; domain: string; createdAt: Date; onboarding: unknown }

export interface SetupInput {
  userCount: number;
  role: "admin" | "member" | null;
  cfg: { dataforseo: { configured: boolean }; setup: { llmStep?: "done" | "skipped"; completedAt?: string } };
  projects: ProjectRow[];
  /** The `sp_project` cookie, if any: the site the wizard should continue with. */
  currentProjectId?: string;
  /** `?step=site` from Settings → "Add a site". */
  stepParam?: string;
}

export interface SetupSelection { step: SetupStepId; project: ProjectRow | null; blocked?: "admin_required" }

export const STEP_ORDER: readonly SetupStepId[] = ["account", "dataforseo", "llm", "site", "profile", "competitors", "build", "done"];

/**
 * The first step whose persisted state is pending (spec §11.1). Pure, so the
 * table in the spec is testable line by line.
 */
export function selectSetupStep(input: SetupInput): SetupSelection {
  if (input.userCount === 0) return { step: "account", project: null };
  const admin = input.role === "admin";
  if (!input.cfg.dataforseo.configured) return { step: "dataforseo", project: null, ...(admin ? {} : { blocked: "admin_required" as const }) };
  if (input.cfg.setup.llmStep === undefined) return { step: "llm", project: null, ...(admin ? {} : { blocked: "admin_required" as const }) };
  if (input.stepParam === "site" || input.projects.length === 0) return { step: "site", project: null };

  const pending = input.projects.filter((p) => !isOnboarded(readOnboarding(p.onboarding)));
  const project =
    pending.find((p) => p.id === input.currentProjectId) ??
    [...pending].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ??
    null;
  if (!project) return { step: "done", project: null };

  const o = readOnboarding(project.onboarding);
  if (o.profile === "pending") return { step: "profile", project };
  if (o.competitors === "pending") return { step: "competitors", project };
  if (o.build !== "done") return { step: "build", project };
  return { step: "done", project };
}
