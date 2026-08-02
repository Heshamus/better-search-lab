import { jobs } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function runJob(db: any, spec: {
  type: string; projectId?: string; date: string;
  handler: (ctx: { db: any; projectId?: string }) => Promise<{ rows: number; cost: number }>;
}): Promise<"done" | "skipped" | "failed"> {
  const dedupeKey = `${spec.type}:${spec.projectId ?? "global"}:${spec.date}`;
  try {
    await db.insert(jobs).values({
      type: spec.type, projectId: spec.projectId ?? null, dedupeKey,
      status: "running", startedAt: new Date(),
    });
  } catch {
    return "skipped"; // unique(dedupeKey) violation → already ran
  }
  try {
    const { rows, cost } = await spec.handler({ db, projectId: spec.projectId });
    await db.update(jobs).set({
      status: "done", finishedAt: new Date(), rowsConsumed: rows, estCost: String(cost),
    }).where(eq(jobs.dedupeKey, dedupeKey));
    return "done";
  } catch (e: any) {
    await db.update(jobs).set({
      status: "failed", finishedAt: new Date(), error: String(e?.message ?? e),
    }).where(eq(jobs.dedupeKey, dedupeKey));
    return "failed";
  }
}
