import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { loadEnv } from "@/config/env";
import { requireAdmin } from "@/lib/api-guard";
import { keyFromEnv } from "@/lib/config/crypto";
import { writeSettings } from "@/lib/config/store";
import { SETUP_LLM_STEPS } from "@/lib/config/registry";

const Body = z.object({ llmStep: z.enum(SETUP_LLM_STEPS).optional(), completed: z.literal(true).optional() });

/** Global wizard steps live in settings under the hidden `setup` group (spec §11.1). */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(); if (admin instanceof Response) return admin;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid input" }, { status: 400 });
  const entries: Record<string, string> = {};
  if (parsed.data.llmStep) entries["setup.llmStep"] = parsed.data.llmStep;
  if (parsed.data.completed) entries["setup.completedAt"] = new Date().toISOString();
  if (Object.keys(entries).length) await writeSettings(db, keyFromEnv(loadEnv()), entries, admin.id);
  return NextResponse.json({ ok: true });
}
