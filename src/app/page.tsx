import { redirect } from "next/navigation";

// The bare domain has no page of its own — real content lives under the
// protected `(app)` group (`/opportunities`, `/rankings`, ...). Without this
// route, `/` 404s for everyone, including an already-authenticated user, and
// login's `callbackUrl=/` redirect lands users on that 404. An unauthenticated
// hit is caught by `src/middleware.ts` before it ever reaches this component.
//
// force-dynamic: this redirect sits in the login success-redirect chain
// (login action → `callbackUrl=/` → here → /overview). Left static, Next.js
// full-route-caches it, and the cached payload gets embedded into the Server
// Action's redirect response — which fresh-login clients reject with "An
// unexpected response was received from the server" (the white "Application
// error" page, only on a session-less login). Every `(app)` page and `/login`
// are already force-dynamic for exactly this reason; this root redirect was
// the missed gap.
export const dynamic = "force-dynamic";

export default function RootPage() {
  redirect("/overview");
}
