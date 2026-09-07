import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
// Default import + destructure, not `import { version } from "...package.json"` —
// Next.js's bundler warns that named exports off a JSON module (only a default
// export) are on their way out.
import pkg from "../../../../package.json";

const { version } = pkg;

export const dynamic = "force-dynamic";

/** Unauthenticated readiness (spec §14.3): compose, CI's smoke and the Railway healthcheck wait on this. */
export async function GET() {
  let dbStatus: "ok" | "error" = "ok";
  try {
    await db.execute(sql`select 1`);
  } catch {
    dbStatus = "error";
  }
  return NextResponse.json({ ok: dbStatus === "ok", version, db: dbStatus }, { status: dbStatus === "ok" ? 200 : 503 });
}
