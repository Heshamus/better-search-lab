import { jobs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { makeProgressWriter } from "./progress";
import type { JobHandler } from "./queue";

function isUniqueViolation(e: any): boolean {
  // postgres-js / pglite surface Postgres code 23505 for unique-constraint violations
  // Also check the message as pglite may surface the error differently through Drizzle
  const msg = String(e?.message ?? e ?? "");
  return e?.code === "23505" || e?.cause?.code === "23505" || /duplicate key|unique/i.test(msg);
}

export async function runJob(db: any, spec: {
  type: string; projectId?: string; date: string;
  handler: JobHandler;
}): Promise<"done" | "skipped" | "failed"> {
  const dedupeKey = `${spec.type}:${spec.projectId ?? "global"}:${spec.date}`;

  // Claim the slot. A unique-violation means a row for this key already exists.
  try {
    await db.insert(jobs).values({
      type: spec.type, projectId: spec.projectId ?? null, dedupeKey,
      status: "running", startedAt: new Date(),
    });
  } catch (e) {
    if (!isUniqueViolation(e)) throw e; // real DB error → surface it, never silently "skip"
    const [existing] = await db.select().from(jobs).where(eq(jobs.dedupeKey, dedupeKey));
    if (existing?.status === "done") return "skipped"; // legitimately already completed
    // Prior attempt is "running" (crashed) or "failed" — re-claim and retry.
    await db.update(jobs).set({
      status: "running", startedAt: new Date(), finishedAt: null, error: null, progress: null,
    }).where(eq(jobs.dedupeKey, dedupeKey));
  }

  const writer = makeProgressWriter(db, { dedupeKey });
  try {
    const { rows, cost } = await spec.handler({ db, projectId: spec.projectId, progress: writer.progress });
    await writer.flush();
    await db.update(jobs).set({
      status: "done", finishedAt: new Date(), rowsConsumed: rows, estCost: String(cost),
    }).where(eq(jobs.dedupeKey, dedupeKey));
    return "done";
  } catch (e: any) {
    await writer.flush().catch(() => undefined);
    await db.update(jobs).set({
      status: "failed", finishedAt: new Date(), error: String(e?.message ?? e),
    }).where(eq(jobs.dedupeKey, dedupeKey));
    return "failed";
  }
}
