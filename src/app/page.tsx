import { redirect } from "next/navigation";

// The bare domain has no page of its own — real content lives under the
// protected `(app)` group (`/opportunities`, `/rankings`, ...). Without this
// route, `/` 404s for everyone, including an already-authenticated user, and
// login's `callbackUrl=/` redirect lands users on that 404. An unauthenticated
// hit is caught by `src/middleware.ts` before it ever reaches this component.
//
// force-dynamic. HISTORICAL: Server Actions were removed in M1 (login posts
// to a route handler now), so the original failure — a full-route-cached
// payload embedded in a Server Action's redirect response, which fresh-login
// clients rejected with "An unexpected response was received from the server"
// — can no longer happen here. Kept because it is still correct on its own
// terms: this redirect depends on the session and must not be cached, and
// every `(app)` page and `/login` are force-dynamic for the same reason.
export const dynamic = "force-dynamic";

export default function RootPage() {
  redirect("/overview");
}
