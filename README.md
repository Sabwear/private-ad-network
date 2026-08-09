# Loopline central platform

This Next.js application is the business portal and operations console for the closed-loop advertising exchange.

## Getting started

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`. Use `pnpm lint` and `pnpm build` before committing.

The portal loads the signed-in user's organization membership through a server-only workspace data layer and uses it for role-aware navigation. Campaigns read from Supabase when the schema is available; the remaining views still use typed demonstration data from `src/lib/platform-data.ts` while their Phase 1 repositories are implemented.
