import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { loadEnv } from "@/config/env";
import { requireAdmin } from "@/lib/api-guard";
import { keyFromEnv } from "@/lib/config/crypto";
import { writeSettings } from "@/lib/config/store";

const Body = z.object({
  checkEnabled: z.boolean().optional(),
  dismissVersion: z.string().min(1).optional(),
  dismissFirstRun: z.boolean().optional(),
});

/**
 * Admin-only: flip the daily update-check preference, and record a dismissal
 * — either the update banner for a specific version, or the one-time
 * first-run card. Writes through the hidden `updates` settings group (see
 * registry.ts), which Settings → Integrations' PUT refuses to touch.
 */
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const entries: Record<string, string | null> = {};
  if (parsed.data.checkEnabled !== undefined) entries["updates.checkEnabled"] = parsed.data.checkEnabled ? "true" : "false";
  if (parsed.data.dismissVersion) entries["updates.dismissedVersion"] = parsed.data.dismissVersion;
  if (parsed.data.dismissFirstRun) entries["updates.firstRunDismissedAt"] = new Date().toISOString();

  if (Object.keys(entries).length) await writeSettings(db, keyFromEnv(loadEnv()), entries, admin.id);
  return NextResponse.json({ ok: true });
}
