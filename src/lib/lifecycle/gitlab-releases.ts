import { REPO_URL } from "@/lib/repo";

export type LatestRelease = { ok: true; version: string; url: string } | { ok: false };

// REPO_URL = https://gitlab.com/betterbrainlab/better-search-lab
const PROJECT_PATH = REPO_URL.replace(/^https?:\/\/[^/]+\//, ""); // "betterbrainlab/better-search-lab"
const ENDPOINT = `https://gitlab.com/api/v4/projects/${encodeURIComponent(PROJECT_PATH)}/releases/permalink/latest`;

/**
 * Fetch the latest published release. FAIL-SOFT by design: any network error,
 * non-2xx, or unparseable body returns { ok: false } — never throws, never logs
 * an error to the user. "No internet" is normal for a self-hosted install.
 */
export async function fetchLatestRelease(opts?: { fetchImpl?: typeof fetch }): Promise<LatestRelease> {
  const f = opts?.fetchImpl ?? fetch;
  try {
    const res = await f(ENDPOINT, { headers: { accept: "application/json" } });
    if (!res.ok) return { ok: false };
    const body = (await res.json()) as { tag_name?: unknown; _links?: { self?: unknown } };
    const tag = typeof body.tag_name === "string" ? body.tag_name : "";
    const version = tag.replace(/^v/i, "");
    if (!/^\d+\.\d+\.\d+/.test(version)) return { ok: false };
    const self = body._links?.self;
    const url = typeof self === "string" && self ? self : `${REPO_URL}/-/releases/${tag}`;
    return { ok: true, version, url };
  } catch {
    return { ok: false };
  }
}
