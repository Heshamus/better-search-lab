## What and why

<!-- One paragraph. Link the issue or the spec/plan section this implements. -->

## How to verify

<!-- Commands or clicks a reviewer can repeat. Mention any setup (keys, demo mode). -->

## Checklist

- [ ] Tests added or updated; `pnpm exec vitest run`, `pnpm exec tsc --noEmit` and `pnpm build` are green
- [ ] No fabricated data: absent or failed data renders as such
- [ ] `pnpm docs:config` run if the settings registry changed; migration committed if the schema changed
- [ ] No internal hostnames, names or secrets
