import { describe, it, expect } from "vitest";
import { demoIframeCookies } from "@/lib/auth/demo-cookies";

// The demo runs embedded in an iframe (the Hugging Face Space page), where the
// default SameSite=Lax cookie is withheld and sign-in fails with MissingCSRF.
// This overrides the three sign-in cookies to SameSite=None; Secure — but only
// over HTTPS, so the local http://localhost demo keeps working.
describe("demoIframeCookies", () => {
  it("relaxes SameSite for the demo served over HTTPS", () => {
    const c = demoIframeCookies({ DEMO_MODE: "true", APP_URL: "https://x.hf.space" });
    expect(c).toBeDefined();
    for (const key of ["sessionToken", "callbackUrl", "csrfToken"] as const) {
      expect(c![key]!.options).toMatchObject({ sameSite: "none", secure: true, path: "/", httpOnly: true });
    }
    // Keep the secure-context cookie names so this overrides the existing
    // cookies rather than creating a second, ignored set.
    expect(c!.csrfToken!.name).toBe("__Host-authjs.csrf-token");
    expect(c!.sessionToken!.name).toBe("__Secure-authjs.session-token");
    expect(c!.callbackUrl!.name).toBe("__Secure-authjs.callback-url");
  });

  it("leaves the local http demo on the SameSite=Lax default (Secure cookies would be dropped over http)", () => {
    expect(demoIframeCookies({ DEMO_MODE: "true", APP_URL: "http://localhost:3000" })).toBeUndefined();
    expect(demoIframeCookies({ DEMO_MODE: "true" })).toBeUndefined();
  });

  it("never touches a real install's cookies, even over HTTPS", () => {
    expect(demoIframeCookies({ APP_URL: "https://seo.example.com" })).toBeUndefined();
    expect(demoIframeCookies({ DEMO_MODE: "false", APP_URL: "https://seo.example.com" })).toBeUndefined();
  });
});
