import { describe, it, expect } from "vitest";
import { generateKeyPairSync, createVerify } from "node:crypto";
import { parseServiceAccountKey, getServiceAccountAccessToken } from "@/lib/google/service-account";

function pem(): string {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return privateKey.export({ type: "pkcs8", format: "pem" }) as string;
}

describe("parseServiceAccountKey", () => {
  it("parses raw JSON and base64 JSON alike", () => {
    const json = JSON.stringify({ client_email: "sa@p.iam.gserviceaccount.com", private_key: pem() });
    expect(parseServiceAccountKey(json)?.clientEmail).toBe("sa@p.iam.gserviceaccount.com");
    expect(parseServiceAccountKey(Buffer.from(json).toString("base64"))?.clientEmail).toBe("sa@p.iam.gserviceaccount.com");
  });

  it("un-escapes literal \\n in the private key (the usual .env pitfall)", () => {
    const parsed = parseServiceAccountKey(JSON.stringify({ client_email: "a@b.iam", private_key: "L1\\nL2" }));
    expect(parsed?.privateKey).toBe("L1\nL2");
  });

  it("returns null (→ clean OAuth fallback) for absent or malformed input", () => {
    expect(parseServiceAccountKey(undefined)).toBeNull();
    expect(parseServiceAccountKey("")).toBeNull();
    expect(parseServiceAccountKey("not json")).toBeNull();
    expect(parseServiceAccountKey(JSON.stringify({ client_email: "x" }))).toBeNull(); // missing private_key
  });
});

describe("getServiceAccountAccessToken", () => {
  it("signs a verifiable RS256 JWT-bearer assertion and returns the token", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const key = { clientEmail: "sa@p.iam.gserviceaccount.com", privateKey: privateKey.export({ type: "pkcs8", format: "pem" }) as string };
    let body: URLSearchParams | null = null;
    const fetchImpl = (async (_url: string, init: any) => {
      body = new URLSearchParams(init.body);
      return new Response(JSON.stringify({ access_token: "sa-at-123", expires_in: 3600 }), { status: 200 });
    }) as any;

    const token = await getServiceAccountAccessToken(key, "scopeA scopeB", { fetchImpl, nowMs: 1_700_000_000_000 });
    expect(token).toBe("sa-at-123");
    expect(body!.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");

    const [h, c, s] = body!.get("assertion")!.split(".");
    const claims = JSON.parse(Buffer.from(c, "base64url").toString());
    expect(claims.iss).toBe(key.clientEmail);
    expect(claims.scope).toBe("scopeA scopeB");
    expect(claims.aud).toBe("https://oauth2.googleapis.com/token");
    expect(claims.exp - claims.iat).toBe(3600);
    // The signature must verify against the SA's public key — proves we signed correctly.
    expect(createVerify("RSA-SHA256").update(`${h}.${c}`).verify(publicKey, Buffer.from(s, "base64url"))).toBe(true);
  });

  it("throws (not silently) when Google rejects the assertion", async () => {
    const key = { clientEmail: "sa@x.iam", privateKey: pem() };
    const fetchImpl = (async () => new Response("bad", { status: 401 })) as any;
    await expect(getServiceAccountAccessToken(key, "s", { fetchImpl })).rejects.toThrow(/service-account token failed: 401/);
  });
});
