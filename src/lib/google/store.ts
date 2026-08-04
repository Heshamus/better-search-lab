import { googleConnections, gscDaily, gscSnapshots } from "@/db/schema";
import { asc, desc, eq } from "drizzle-orm";
import type { GscTotals, GscTopRow } from "@/lib/google/gsc";

export interface GscConnection {
  refreshToken: string;
  propertyUrl: string | null;
}

export interface GscDailyPoint {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscData {
  daily: GscDailyPoint[];
  totals: GscTotals | null;
  topQueries: GscTopRow[];
  topPages: GscTopRow[];
  connectedAt: Date;
}

/** Create or update a project's GSC connection. A null refreshToken keeps the
 *  existing one (re-selecting a property shouldn't wipe the token). */
export async function upsertConnection(
  db: any,
  projectId: string,
  p: { refreshToken?: string | null; propertyUrl?: string | null },
): Promise<void> {
  const [existing] = await db.select().from(googleConnections).where(eq(googleConnections.projectId, projectId)).limit(1);
  if (existing) {
    const set: Record<string, unknown> = {};
    if (p.refreshToken) set.refreshToken = p.refreshToken;
    if (p.propertyUrl !== undefined) set.propertyUrl = p.propertyUrl;
    if (Object.keys(set).length) await db.update(googleConnections).set(set).where(eq(googleConnections.projectId, projectId));
  } else {
    await db.insert(googleConnections).values({ projectId, refreshToken: p.refreshToken ?? "", propertyUrl: p.propertyUrl ?? null });
  }
}

export async function getConnection(db: any, projectId: string): Promise<GscConnection | null> {
  const [row] = await db
    .select({ refreshToken: googleConnections.refreshToken, propertyUrl: googleConnections.propertyUrl })
    .from(googleConnections)
    .where(eq(googleConnections.projectId, projectId))
    .limit(1);
  return row ? { refreshToken: row.refreshToken, propertyUrl: row.propertyUrl ?? null } : null;
}

/** Replace the whole daily series for a project (each sync pulls the full window). */
export async function replaceGscDaily(db: any, projectId: string, rows: GscDailyPoint[]): Promise<void> {
  await db.transaction(async (tx: any) => {
    await tx.delete(gscDaily).where(eq(gscDaily.projectId, projectId));
    if (rows.length === 0) return;
    await tx.insert(gscDaily).values(rows.map((r) => ({ projectId, ...r })));
  });
}

export async function saveGscSnapshot(
  db: any,
  projectId: string,
  data: { totals: GscTotals; topQueries: GscTopRow[]; topPages: GscTopRow[] },
): Promise<void> {
  await db.insert(gscSnapshots).values({ projectId, totals: data.totals, topQueries: data.topQueries, topPages: data.topPages });
}

/** Everything the Search Console dashboard needs, or null if never synced. */
export async function getGscData(db: any, projectId: string): Promise<GscData | null> {
  const [snap] = await db
    .select()
    .from(gscSnapshots)
    .where(eq(gscSnapshots.projectId, projectId))
    .orderBy(desc(gscSnapshots.createdAt))
    .limit(1);
  if (!snap) return null;
  const daily = await db
    .select({ date: gscDaily.date, clicks: gscDaily.clicks, impressions: gscDaily.impressions, ctr: gscDaily.ctr, position: gscDaily.position })
    .from(gscDaily)
    .where(eq(gscDaily.projectId, projectId))
    .orderBy(asc(gscDaily.date));
  return {
    daily: daily as GscDailyPoint[],
    totals: (snap.totals ?? null) as GscTotals | null,
    topQueries: (snap.topQueries ?? []) as GscTopRow[],
    topPages: (snap.topPages ?? []) as GscTopRow[],
    connectedAt: snap.createdAt,
  };
}
