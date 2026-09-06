import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { db } from "@/db/client";
import { loadEnv } from "@/config/env";
import { requireAdmin } from "@/lib/api-guard";
import { keyFromEnv } from "@/lib/config/crypto";
import { writeSettings } from "@/lib/config/store";
import { envOverriddenKeys, envOverrideName } from "@/lib/config/resolve";
import { settingByKey } from "@/lib/config/registry";
import { buildIntegrationsView } from "@/lib/config/view";

export async function GET() {
  const admin = await requireAdmin(); if (admin instanceof Response) return admin;
  return NextResponse.json(await buildIntegrationsView(db));
}

/** Body: { values: { [registryKey]: string | null } } — null (or "") deletes. */
export async function PUT(req: NextRequest) {
  const admin = await requireAdmin(); if (admin instanceof Response) return admin;
  const body = (await req.json().catch(() => ({}))) as { values?: unknown };
  const values = body.values;
  if (!values || typeof values !== "object" || Array.isArray(values)) return NextResponse.json({ error: "values must be an object" }, { status: 400 });

  const entries: Record<string, string | null> = {};
  const overridden = new Set(envOverriddenKeys());
  for (const [key, raw] of Object.entries(values as Record<string, unknown>)) {
    const def = settingByKey(key);
    if (!def) return NextResponse.json({ error: `unknown setting: ${key}` }, { status: 400 });
    if (overridden.has(key)) {
      return NextResponse.json(
        { error: `${def.label} is set via the environment variable ${envOverrideName(key) ?? def.env}; change it there.` },
        { status: 400 },
      );
    }
    if (raw !== null && typeof raw !== "string") return NextResponse.json({ error: `${def.label} must be a string` }, { status: 400 });
    entries[key] = raw;
  }

  try {
    await writeSettings(db, keyFromEnv(loadEnv()), entries, admin.id);
  } catch (e) {
    if (e instanceof ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "invalid value" }, { status: 400 });
    throw e;
  }
  return NextResponse.json(await buildIntegrationsView(db));
}
