# Loopline central platform

This Next.js application is the business portal and operations console for the closed-loop advertising exchange.

## Getting started

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`. Use `pnpm lint`, `pnpm build`, and `pnpm build:worker` before committing.

## Cloudflare Workers

The app uses the Cloudflare OpenNext adapter. `pnpm preview` runs the production bundle in the local Workers runtime, while `pnpm deploy` builds and deploys it. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` as Cloudflare build variables before deploying from GitHub.

The portal loads the signed-in user's organization membership through a server-only workspace data layer and uses it for role-aware navigation. Campaigns and screens read tenant-scoped data from Supabase when the schema is available; the remaining views still use typed demonstration data from `src/lib/platform-data.ts` while their Phase 1 repositories are implemented.
