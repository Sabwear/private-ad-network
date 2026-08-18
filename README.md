# Loopline central platform

This Next.js application is the business portal and operations console for the closed-loop advertising exchange.

## Getting started

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`. Use `pnpm test:beta` before shipping a beta build. The supported and deferred beta scope is recorded in `docs/BETA_READINESS.md`.

For the current implementation inventory, repository map, active risks, and prioritized next phase, start with [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md). [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md) remains the phase-by-phase delivery backlog.

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

The dashboard is a single centrally administered platform. Only active platform administrators can enter it or mutate businesses, campaigns, media, locations, screens, channels, stream operations, users, wallets, and credit settings. Businesses are managed records and are never assigned to users. Non-admin accounts are approved viewers used only for optional registered stream identity; anonymous playback remains available from valid stream links.

Administrators create and publish campaigns with approved media, business targets, locations, dates, budgets, delivery limits, and targeting rules. A host business can define recurring busy periods that multiply advertiser consumption during valuable local-time windows. If one advertiser runs out of spendable credit, only its ads leave fresh playlists; the channel and other campaigns continue. Physical-device proof and financial settlement remain gated until their backend services and acceptance tests are complete.

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

Uploaded media jobs also generate adaptive 720p and 480p HLS renditions. The media library accepts either a private MP4 upload or a supported YouTube URL. Administrator submissions require a rights declaration and technical validation, then approve directly without a second review queue. Platform administrators manage continuous streams from `/operations`, target businesses, add approved media, and copy or change the protected viewer URL. Live telemetry and accepted proof-of-play evidence are consolidated under `/monitor`. Each browser channel maintains one server-clock timeline, so every viewer joins the current point in the loop instead of restarting media on page load; an administrator can place that timeline on standby from channel handling or in-player settings. The first seeded stream is `Primary Network Channel`; the schema and interface support additional channels without changing the player contract.

## Operations

`/api/health` confirms that the web service is running. `/api/ready` additionally checks the server-side database connection and returns `503` when the application is not ready to serve production work. Both endpoints are public, disclose no credentials, and disable caching.

The media processor is a separate long-running service and is not started by a normal Vercel web deployment. Run its container on a worker-capable host before uploading beta media.

## Controlled demo data

`supabase/demo_seed.sql` creates a repeatable, clearly marked beta dataset with three businesses, locations, screens, one campaign draft, and one playable approved media item. The current hosted project has this dataset installed for testing.

Platform administrators can remove it from **Admin control → Demo content controls**. Cleanup requires acknowledging the warning, typing `DELETE DEMO DATA`, and accepting a final confirmation dialog. The server removes only organizations carrying the protected demo marker; related demo records and private demo files are removed with them.
