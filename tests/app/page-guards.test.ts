import { describe, it, expect, vi, beforeEach } from "vitest";

// The page-level half of the auth story. src/middleware.ts only pre-filters on
// a JWT; the layouts and the (auth) pages are what actually decide who sees
// what, and until now nothing asserted their redirects. `redirect()` is mocked
// to THROW (as Next's real one does, via an internal error) so a guard that
// forgets to return still fails the test rather than falling through.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error("REDIRECT:" + url);
  },
}));
// resolveSessionUser and requireAdminUser stay REAL (an intra-module call
// cannot be intercepted anyway); the session is driven through the two things
// they actually read — auth() and the one users-table lookup.
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/db/client", () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => userRows }) }) }) },
}));
vi.mock("@/lib/auth/users", () => ({ countUsers: vi.fn() }));
// /setup (Task 7) now loads the wizard's config/projects/cookie state too.
// Those paths are exercised in full by tests/app/setup-page.test.ts; here
// they only need to be inert so the pre-existing redirect-story tests below
// (driven by countUsers + auth()) can still reach the code path they assert.
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/config/resolve", () => ({ getConfig: vi.fn(async () => ({ dataforseo: { configured: false }, setup: { llmStep: undefined, completedAt: undefined } })) }));
vi.mock("@/lib/projects", () => ({ listProjects: vi.fn(async () => []) }));
// Bare vi.fn() returns undefined (falsy) by default, so every pre-existing
// test below runs as non-demo without touching it — only the demo-specific
// test configures a return value.
vi.mock("@/lib/demo/mode", () => ({ isDemoMode: vi.fn() }));

import { auth } from "@/auth";
import { requireAdminUser } from "@/lib/auth/session";
import { countUsers } from "@/lib/auth/users";
import { isDemoMode } from "@/lib/demo/mode";
import AppLayout from "@/app/(app)/layout";
import SettingsLayout from "@/app/(app)/settings/layout";
import LoginPage from "@/app/(auth)/login/page";
import SetupPage from "@/app/(auth)/setup/page";

const ADMIN = { id: "u1", email: "a@example.com", role: "admin" as const };
const MEMBER = { id: "u2", email: "m@example.com", role: "member" as const };

/** The row the mocked db hands back for the session lookup; set by signedInAs. */
let userRows: Array<{ id: string; email: string; role: string; sessionVersion: number }> = [];

function signedInAs(user: typeof ADMIN | typeof MEMBER | null) {
  if (!user) {
    (auth as any).mockResolvedValue(null);
    userRows = [];
    return;
  }
  (auth as any).mockResolvedValue({ user: { id: user.id }, sv: 1 });
  userRows = [{ ...user, sessionVersion: 1 }];
}

/** The redirect URL a guard sent us to, or null if it rendered instead. */
async function redirectOf(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (!message.startsWith("REDIRECT:")) throw e;
    return message.slice("REDIRECT:".length);
  }
}

beforeEach(() => {
  (auth as any).mockReset();
  (countUsers as any).mockReset();
  (isDemoMode as any).mockReset();
  userRows = [];
});

describe("(app) layouts", () => {
  it("sends a request with no valid session back to /login with a reason", async () => {
    signedInAs(null);
    expect(await redirectOf(() => AppLayout({ children: null }))).toBe("/login?reason=signed-out");
  });

  it("sends a JWT whose user row is gone back to /login too", async () => {
    (auth as any).mockResolvedValue({ user: { id: "deleted" }, sv: 1 });
    userRows = [];
    expect(await redirectOf(() => AppLayout({ children: null }))).toBe("/login?reason=signed-out");
  });

  it("renders the shell for a resolved session user", async () => {
    signedInAs(MEMBER);
    expect(await redirectOf(() => AppLayout({ children: null }))).toBeNull();
  });

  it("guards the nested settings layout independently of the parent", async () => {
    signedInAs(null);
    expect(await redirectOf(() => SettingsLayout({ children: null }))).toBe("/login?reason=signed-out");
    signedInAs(MEMBER);
    expect(await redirectOf(() => SettingsLayout({ children: null }))).toBeNull();
  });
});

describe("requireAdminUser", () => {
  it("bounces a member to /settings with an explanation instead of a bare 403", async () => {
    signedInAs(MEMBER);
    expect(await redirectOf(() => requireAdminUser())).toBe("/settings?error=admin_only");
  });

  it("sends a signed-out request to /login", async () => {
    signedInAs(null);
    expect(await redirectOf(() => requireAdminUser())).toBe("/login?reason=signed-out");
  });

  it("returns the user for an admin", async () => {
    signedInAs(ADMIN);
    await expect(requireAdminUser()).resolves.toEqual(ADMIN);
  });
});

describe("(auth) pages", () => {
  it("sends /login to /setup while the users table is empty, before reading the session", async () => {
    (countUsers as any).mockResolvedValue(0);
    signedInAs(null);
    const sp = Promise.resolve({});
    expect(await redirectOf(() => LoginPage({ searchParams: sp }))).toBe("/setup");
    expect(auth).not.toHaveBeenCalled();
  });

  it("sends an already-signed-in visitor to their sanitised callbackUrl", async () => {
    (countUsers as any).mockResolvedValue(1);
    signedInAs(ADMIN);
    const sp = Promise.resolve({ callbackUrl: "/rankings" });
    expect(await redirectOf(() => LoginPage({ searchParams: sp }))).toBe("/rankings");
  });

  it("renders the login form for a signed-out visitor once an admin exists", async () => {
    (countUsers as any).mockResolvedValue(1);
    signedInAs(null);
    const sp = Promise.resolve({ callbackUrl: "/rankings" });
    expect(await redirectOf(() => LoginPage({ searchParams: sp }))).toBeNull();
  });

  it("does not redirect to /setup with zero users when demo mode is on — a failed seed must render here, not loop", async () => {
    (countUsers as any).mockResolvedValue(0);
    (isDemoMode as any).mockReturnValue(true);
    signedInAs(null);
    const sp = Promise.resolve({});
    expect(await redirectOf(() => LoginPage({ searchParams: sp }))).toBeNull();
  });

  it("closes /setup once the first admin exists and nobody is signed in", async () => {
    (countUsers as any).mockResolvedValue(1);
    const sp = Promise.resolve({});
    // The wizard must stay reachable for a signed-in user (Task 7) — the
    // redirect target now carries a callback back to /setup, not a bare /login.
    expect(await redirectOf(() => SetupPage({ searchParams: sp }))).toBe("/login?callbackUrl=%2Fsetup");
  });

  it("keeps /setup open while there are no users", async () => {
    (countUsers as any).mockResolvedValue(0);
    const sp = Promise.resolve({});
    expect(await redirectOf(() => SetupPage({ searchParams: sp }))).toBeNull();
  });
});
