import { redirect } from "next/navigation";

// The bare domain has no page of its own — real content lives under the
// protected `(app)` group (`/opportunities`, `/rankings`, ...). Without this
// route, `/` 404s for everyone, including an already-authenticated user, and
// login's `callbackUrl=/` redirect lands users on that 404. An unauthenticated
// hit is caught by `src/middleware.ts` before it ever reaches this component.
export default function RootPage() {
  redirect("/opportunities");
}
