<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Loopline project rules

- Read `CODEX.md` and `docs/PROJECT_STATUS.md` before changing product behavior.
- The dashboard is administrator-only. Businesses are managed records, not user workspaces or account assignments.
- Non-admin accounts are registered stream viewers and must not receive dashboard permissions.
- Do not reintroduce organization membership or owner/staff/finance/moderator authorization.
- Update `CODEX.md` and the relevant project documentation with every material behavior, schema, architecture, security, testing, or phase change.
- Run the relevant validation before completion; use `pnpm test:beta` for release-sized changes.
- When the repository has a configured GitHub remote, commit the completed scope and push it with normal `git` commands after checks pass.
