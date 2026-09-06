import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project. Without this, Next.js's lockfile
  // detection can walk up to an unrelated lockfile outside the repo and infer
  // the wrong root, which affects build output file tracing.
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
