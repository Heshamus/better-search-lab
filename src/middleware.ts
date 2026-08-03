import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Uses the edge-safe `authConfig` (no DB/bcrypt) — see auth.config.ts.
// With no wrapper middleware function passed to `auth(...)`, Auth.js falls
// back to its own default behavior: run `callbacks.authorized`, and when it
// returns false, 302-redirect to `pages.signIn` ("/login") with the original
// URL preserved as `?callbackUrl=`.
export const { auth: middleware } = NextAuth(authConfig);
export default middleware;

// Route groups like `(app)` don't appear in the URL — its pages
// (opportunities, rankings, keywords, ...) live at the site root. So "guard
// the (app) group" means: protect everything except the public `/login`
// page, the Auth.js endpoints under `/api/auth`, and Next.js internals.
// `/api/projects` and other API routes are intentionally NOT matched here —
// per the Task 11 design they enforce their own 401 via `auth()` inside the
// route handler.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|login).*)"],
};
