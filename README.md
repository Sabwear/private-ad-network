# Loopline central platform

This Next.js application is the business portal and operations console for the closed-loop advertising exchange.

## Getting started

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`. Use `pnpm lint`, `pnpm build`, and `pnpm build:worker` before committing.

## Cloudflare Workers

The app uses the Cloudflare OpenNext adapter. `pnpm preview` runs the production bundle in the local Workers runtime, while `pnpm deploy` builds and deploys it. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and the deployed origin as `NEXT_PUBLIC_SITE_URL` in Cloudflare build variables before deploying from GitHub.

## Authentication setup

Email/password sign-up, confirmation, sign-in, password recovery, and secure sign-out use Supabase Auth with cookie-based SSR sessions. In Supabase Authentication URL Configuration, set the Site URL to the deployed app and allow `<site-url>/auth/callback` as a redirect URL. Configure custom SMTP before a production pilot; Supabase's default mailer is intended only for initial testing and is heavily rate-limited.

The portal loads the signed-in user's organization membership through a server-only workspace data layer and uses it for role-aware navigation. Campaigns and screens read tenant-scoped data from Supabase when the schema is available; the remaining views still use typed demonstration data from `src/lib/platform-data.ts` while their Phase 1 repositories are implemented.

Verified accounts do not automatically receive business access. A platform administrator creates each organization manually and assigns one pending account as owner. Until assignment, the account sees a dedicated waiting screen and cannot enter the workspace.

## Database migrations

The complete database project is versioned in `supabase/`. From this repository root, link the hosted project and review migrations before deployment:

```bash
pnpm exec supabase login
pnpm exec supabase --workdir . link --project-ref YOUR_PROJECT_REF
pnpm db:push:check
pnpm exec supabase --workdir . db push
```

After deploying, bootstrap the first platform administrator using the controlled procedure in `docs/SUPABASE_SETUP.md`.
