import { describe, it, expect } from "vitest";
import { authConfig, isPublicPath } from "@/auth.config";

const authorized = authConfig.callbacks!.authorized!;
const req = (pathname: string) => ({ nextUrl: { pathname } }) as any;

describe("auth.config authorized", () => {
  it("passes the public paths through without a session", () => {
    for (const p of ["/login", "/setup", "/api/health", "/api/auth/callback/credentials"]) {
      expect(isPublicPath(p)).toBe(true);
      expect(authorized({ auth: null, request: req(p) } as any)).toBe(true);
    }
  });
  it("requires a session everywhere else, including lookalike paths", () => {
    for (const p of ["/", "/overview", "/login-help", "/settings/integrations"]) {
      expect(isPublicPath(p)).toBe(false);
      expect(authorized({ auth: null, request: req(p) } as any)).toBe(false);
      expect(authorized({ auth: { user: { id: "u" } }, request: req(p) } as any)).toBe(true);
    }
  });
});
