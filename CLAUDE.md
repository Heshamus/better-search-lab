# Better Search Lab — notes for coding agents

Stack: Next.js 15 App Router, React 19, TypeScript, Drizzle + Postgres (pglite in tests), Auth.js v5, zod 4, Tailwind v4 ("Signal" tokens in `src/app/globals.css`), Vitest 4. The MCP server is a separate npm package in `mcp/`.

Run before claiming anything is done: `pnpm exec tsc --noEmit`, `pnpm exec vitest run`, `pnpm build`; `cd mcp && npx vitest run` when `mcp/` changes. Read the output.

Conventions:
- Pages are server components that read `src/lib/*`; mutations are client components calling guarded routes under `src/app/api/`, then `router.refresh()`. Long work is a job in `src/lib/jobs/` with progress lines.
- Honesty is structural: never render a made-up number; "not connected" and real error text are the correct output.
- Settings live in `src/lib/config/registry.ts`; run `pnpm docs:config` after editing it. Schema changes need `pnpm db:generate` and a committed migration.
- DataForSEO only through `src/lib/dataforseo/client.ts`, fixture-tested, cost-logged.
- No internal hostnames or names anywhere (`tests/repo/no-internal-references.test.ts`).
- Design and planning documents live under `docs/superpowers/` (specs → plans → tasks). Read the relevant spec before changing behaviour it defines.
