import { googleConnections, gscDaily, gscSnapshots, gaDaily, gaSnapshots } from "@/db/schema";
import { asc, desc, eq } from "drizzle-orm";
import type { GscTotals, GscTopRow, RisingQuery } from "@/lib/google/gsc";
import type { GaTotals, GaChannelRow, GaPageRow } from "@/lib/google/analytics";

export interface GscConnection {
  refreshToken: string;
  propertyUrl: string | null;
  gaPropertyId: string | null;
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
  risingQueries: RisingQuery[];
  connectedAt: Date;
}

/** Create or update a project's Google connection. A null refreshToken keeps the
 *  existing one (re-selecting a property shouldn't wipe the token). */
export async function upsertConnection(
  db: any,
  projectId: string,
  p: { refreshToken?: string | null; propertyUrl?: string | null; gaPropertyId?: string | null },
): Promise<void> {
  const [existing] = await db.select().from(googleConnections).where(eq(googleConnections.projectId, projectId)).limit(1);
  if (existing) {
    const set: Record<string, unknown> = {};
    if (p.refreshToken) set.refreshToken = p.refreshToken;
    if (p.propertyUrl !== undefined) set.propertyUrl = p.propertyUrl;
    if (p.gaPropertyId !== undefined) set.gaPropertyId = p.gaPropertyId;
    if (Object.keys(set).length) await db.update(googleConnections).set(set).where(eq(googleConnections.projectId, projectId));
  } else {
    await db
      .insert(googleConnections)
      .values({ projectId, refreshToken: p.refreshToken ?? "", propertyUrl: p.propertyUrl ?? null, gaPropertyId: p.gaPropertyId ?? null });
  }
}

/** Set just the GA4 property for a project (used by the property picker). */
export async function setGaProperty(db: any, projectId: string, gaPropertyId: string): Promise<void> {
  await upsertConnection(db, projectId, { gaPropertyId });
}

export async function getConnection(db: any, projectId: string): Promise<GscConnection | null> {
  const [row] = await db
    .select({
      refreshToken: googleConnections.refreshToken,
      propertyUrl: googleConnections.propertyUrl,
      gaPropertyId: googleConnections.gaPropertyId,
    })
    .from(googleConnections)
    .where(eq(googleConnections.projectId, projectId))
    .limit(1);
  return row ? { refreshToken: row.refreshToken, propertyUrl: row.propertyUrl ?? null, gaPropertyId: row.gaPropertyId ?? null } : null;
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
  data: { totals: GscTotals; topQueries: GscTopRow[]; topPages: GscTopRow[]; risingQueries?: RisingQuery[] },
): Promise<void> {
  await db.insert(gscSnapshots).values({
    projectId,
    totals: data.totals,
    topQueries: data.topQueries,
    topPages: data.topPages,
    risingQueries: data.risingQueries ?? [],
  });
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
    risingQueries: (snap.risingQueries ?? []) as RisingQuery[],
    connectedAt: snap.createdAt,
  };
}

// ── Google Analytics 4 ───────────────────────────────────────────────────────

export interface GaDailyPoint {
  date: string;
  sessions: number;
  users: number;
}

export interface GaData {
  daily: GaDailyPoint[];
  totals: GaTotals | null;
  channels: GaChannelRow[];
  topPages: GaPageRow[];
  syncedAt: Date;
}

/** Replace the whole daily series for a project (each sync pulls the full window). */
export async function replaceGaDaily(db: any, projectId: string, rows: GaDailyPoint[]): Promise<void> {
  await db.transaction(async (tx: any) => {
    await tx.delete(gaDaily).where(eq(gaDaily.projectId, projectId));
    if (rows.length === 0) return;
    await tx.insert(gaDaily).values(rows.map((r) => ({ projectId, ...r })));
  });
}

export async function saveGaSnapshot(
  db: any,
  projectId: string,
  data: { totals: GaTotals; channels: GaChannelRow[]; topPages: GaPageRow[] },
): Promise<void> {
  await db.insert(gaSnapshots).values({ projectId, totals: data.totals, channels: data.channels, topPages: data.topPages });
}

/** Everything the Analytics dashboard needs, or null if never synced. */
export async function getGaData(db: any, projectId: string): Promise<GaData | null> {
  const [snap] = await db
    .select()
    .from(gaSnapshots)
    .where(eq(gaSnapshots.projectId, projectId))
    .orderBy(desc(gaSnapshots.createdAt))
    .limit(1);
  if (!snap) return null;
  const daily = await db
    .select({ date: gaDaily.date, sessions: gaDaily.sessions, users: gaDaily.users })
    .from(gaDaily)
    .where(eq(gaDaily.projectId, projectId))
    .orderBy(asc(gaDaily.date));
  return {
    daily: daily as GaDailyPoint[],
    totals: (snap.totals ?? null) as GaTotals | null,
    channels: (snap.channels ?? []) as GaChannelRow[],
    topPages: (snap.topPages ?? []) as GaPageRow[],
    syncedAt: snap.createdAt,
  };
}
