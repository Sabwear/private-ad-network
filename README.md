# Loopline central platform

This Next.js application is the business portal and operations console for the closed-loop advertising exchange.

## Getting started

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`. Use `pnpm test:beta` before shipping a beta build. The supported and deferred beta scope is recorded in `docs/BETA_READINESS.md`.

## Deployment

The application is a standard Next.js deployment with no required hosting-provider adapter. Vercel can import this repository and deploy it directly. The standalone output can also run on any Node.js container host using the included `Dockerfile`.

Configure these environment variables in every deployment environment:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
NEXT_PUBLIC_SITE_URL=https://your-app.example.com
SUPABASE_SECRET_KEY=sb_secret_your_server_key
```

`SUPABASE_SECRET_KEY` is server-only and must be stored in the host's encrypted environment settings. Never expose it through a `NEXT_PUBLIC_` variable.

## Authentication setup

Email/password sign-up, confirmation, sign-in, password recovery, and secure sign-out use Supabase Auth with cookie-based SSR sessions. In Supabase Authentication URL Configuration, set the Site URL to the deployed app and allow `<site-url>/auth/callback` as a redirect URL. Configure custom SMTP before a production pilot; Supabase's default mailer is intended only for initial testing and is heavily rate-limited.

The portal loads the signed-in user's organization membership through a server-only workspace data layer and uses it for role-aware navigation. The limited-beta operational pages read tenant-scoped data from the database. Business users can save campaign drafts with approved media, business targets, dates, and delivery limits; activation remains locked until atomic credit holds are implemented. Finance, proof, and reporting remain explicitly disabled until their backend services and acceptance tests are implemented.

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

## Media processor

Video validation and normalization run outside the web application in `workers/media-processor`. Build it with `pnpm worker:media:build` or deploy its container with:

```bash
docker build -f workers/media-processor/Dockerfile -t loopline-media-processor .
```

The worker requires `SUPABASE_URL` and the server-only `SUPABASE_SECRET_KEY`. FFmpeg and FFprobe are included in the container; the secret must be stored in the worker host's protected environment settings.

New media jobs also generate adaptive 720p and 480p HLS renditions. Platform administrators manage continuous streams from `/channels`, assign businesses, add approved media, and copy the protected viewer URL. The first seeded stream is `Primary Network Channel`; the schema and interface support additional channels without changing the player contract.

## Operations

`/api/health` confirms that the web service is running. `/api/ready` additionally checks the server-side database connection and returns `503` when the application is not ready to serve production work. Both endpoints are public, disclose no credentials, and disable caching.

The media processor is a separate long-running service and is not started by a normal Vercel web deployment. Run its container on a worker-capable host before uploading beta media.

## Controlled demo data

`supabase/demo_seed.sql` creates a repeatable, clearly marked beta dataset with three businesses, locations, screens, one campaign draft, and one playable approved media item. The current hosted project has this dataset installed for testing.

Platform administrators can remove it from **Admin control → Demo content controls**. Cleanup requires acknowledging the warning, typing `DELETE DEMO DATA`, and accepting a final confirmation dialog. The server removes only organizations carrying the protected demo marker; related demo records and private demo files are removed with them.
