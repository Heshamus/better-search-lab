import { describe, it, expect } from "vitest";
import { refreshAccessToken, GoogleReauthRequiredError, isGoogleReauthError } from "@/lib/google/oauth";

const resp = (body: unknown, status = 200) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

const base = { clientId: "cid", clientSecret: "secret", refreshToken: "rt" };

describe("refreshAccessToken", () => {
  it("returns the access token on success", async () => {
    const token = await refreshAccessToken({ ...base, fetchImpl: (async () => resp({ access_token: "at123" })) as any });
    expect(token).toBe("at123");
  });

  it("throws a reconnect-able GoogleReauthRequiredError on a 400 invalid_grant (invalid_rapt)", async () => {
    const body = { error: "invalid_grant", error_description: "reauth related error (invalid_rapt)", error_subtype: "invalid_rapt" };
    const fetchImpl = (async () => resp(body, 400)) as any;
    await expect(refreshAccessToken({ ...base, fetchImpl })).rejects.toBeInstanceOf(GoogleReauthRequiredError);
    // The message is user-facing and actionable — NOT Google's raw JSON.
    await refreshAccessToken({ ...base, fetchImpl }).catch((e) => {
      expect(isGoogleReauthError(e)).toBe(true);
      expect((e as Error).message).toMatch(/reconnect/i);
      expect((e as Error).message).not.toMatch(/invalid_grant/);
    });
  });

  it("throws a plain (non-reauth) error on other failures so real bugs aren't masked", async () => {
    const fetchImpl = (async () => resp("upstream boom", 500)) as any;
    const err = await refreshAccessToken({ ...base, fetchImpl }).catch((e) => e);
    expect(isGoogleReauthError(err)).toBe(false);
    expect((err as Error).message).toContain("500");
  });
});
