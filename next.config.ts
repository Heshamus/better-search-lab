import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project. Without this, Next.js's lockfile
  // detection can walk up to an unrelated lockfile outside the repo and infer
  // the wrong root, which affects build output file tracing.
  outputFileTracingRoot: import.meta.dirname,

  experimental: {
    serverActions: {
      // Server Actions (e.g. the login form's `authenticate`) run behind a
      // reverse-proxy chain (Traefik -> oauth2-proxy -> app) that rewrites the
      // forwarded host. Next.js's built-in Server Action origin check then sees
      // the request `Origin` (the public host) differ from the forwarded host
      // and REJECTS the POST — the client surfaces this as the opaque
      // "An unexpected response was received from the server." Trusting the
      // public host(s) lets the check pass behind the proxy. Deployment-only;
      // has no effect on same-origin local dev.
      allowedOrigins: ["seo-web.supergenius.cloud", "*.supergenius.cloud"],
    },
  },
};

export default nextConfig;
