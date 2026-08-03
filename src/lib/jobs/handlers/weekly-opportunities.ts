import { eq } from "drizzle-orm";
import { projects } from "@/db/schema";
import { assembleOpportunities } from "@/lib/core/opportunity-engine";
import { loadDetectorInput, mondayOf, upsertOpportunities } from "@/lib/opportunities";

/**
 * `weekly_opportunities`: turns already-collected signals (rank snapshots,
 * keyword metrics, competitor gaps) into a ranked opportunity shortlist for
 * the project's current ISO week. Pure over stored data — no DataForSEO call,
 * so no `logApiUsage`/`estimateCost`; cost is always 0.
 *
 * `asOf` defaults to `new Date()` in production; tests pass an explicit date
 * so results (and the `weekOf` they land under) stay reproducible.
 *
 * Loads the project row to read its saved `opportunityWeights` (tuned via
 * the Settings screen, `POST /api/projects/[id]/settings`) and threads it
 * through as `assembleOpportunities`' `weights` opt. A project that never
 * tuned weights has a null column, which becomes `undefined` here so
 * `assembleOpportunities`/`scoreOpportunity` fall back to `DEFAULT_WEIGHTS` —
 * unchanged behavior for every project until it opts in.
 */
export function weeklyOpportunitiesHandler() {
  return async (ctx: { db: any; projectId?: string; asOf?: Date }) => {
    const { db, projectId } = ctx;
    const asOf = ctx.asOf ?? new Date();

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId!));
    const input = await loadDetectorInput(db, projectId!, asOf);
    const results = assembleOpportunities(input, { weights: project?.opportunityWeights ?? undefined });
    const weekOf = mondayOf(asOf.toISOString().slice(0, 10));
    await upsertOpportunities(db, projectId!, weekOf, results);

    return { rows: results.length, cost: 0 };
  };
}
