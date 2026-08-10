import { describe, it, expect } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { getGoogleAccessToken, isGoogleConfigured } from "@/lib/google/access-token";

function saKeyJson(): string {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return JSON.stringify({ client_email: "sa@p.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) });
}

// A fetch that records which OAuth grant was used, so we can assert WHICH auth
// path getGoogleAccessToken took without mocking internals.
function grantSpy(token: string) {
  const seen = { grant: null as string | null };
  const fetchImpl = (async (_url: string, init: any) => {
    seen.grant = new URLSearchParams(init.body).get("grant_type");
    return new Response(JSON.stringify({ access_token: token }), { status: 200 });
  }) as any;
  return { seen, fetchImpl };
}

describe("isGoogleConfigured", () => {
  it("true via a service account key", () => expect(isGoogleConfigured({ GOOGLE_SA_KEY: saKeyJson() } as any)).toBe(true));
  it("true via client id+secret", () => expect(isGoogleConfigured({ GOOGLE_CLIENT_ID: "c", GOOGLE_CLIENT_SECRET: "s" } as any)).toBe(true));
  it("false with neither", () => expect(isGoogleConfigured({} as any)).toBe(false));
});

describe("getGoogleAccessToken", () => {
  it("prefers the service account (jwt-bearer, ignores the refresh token) when GOOGLE_SA_KEY is set", async () => {
    const { seen, fetchImpl } = grantSpy("sa-token");
    const token = await getGoogleAccessToken({ GOOGLE_SA_KEY: saKeyJson() } as any, "ignored-refresh-token", fetchImpl);
    expect(token).toBe("sa-token");
    expect(seen.grant).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
  });

  it("falls back to the user refresh-token grant when no service account is configured", async () => {
    const { seen, fetchImpl } = grantSpy("user-token");
    const token = await getGoogleAccessToken({ GOOGLE_CLIENT_ID: "c", GOOGLE_CLIENT_SECRET: "s" } as any, "rt", fetchImpl);
    expect(token).toBe("user-token");
    expect(seen.grant).toBe("refresh_token");
  });

  it("throws a connect-needed error when neither a SA nor a refresh token is available", async () => {
    await expect(getGoogleAccessToken({ GOOGLE_CLIENT_ID: "c", GOOGLE_CLIENT_SECRET: "s" } as any, null)).rejects.toThrow(/not connected/);
  });
});
