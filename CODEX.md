# Codex Project Handoff

Last updated: 2026-08-20

## Product authority model

- The dashboard is one centrally administered platform.
- Only active `admin` profiles can enter or mutate dashboard features.
- Businesses are managed domain records. They are never assigned to users and never own a workspace.
- Non-admin accounts are `viewer` accounts. They may authenticate for registered stream viewing but receive no dashboard permissions.
- Public/anonymous stream viewing remains supported where the channel link permits it.

Do not reintroduce organization membership, business-owner, staff, finance, moderator, or tenant-workspace authorization into application features.

## Current implementation

- Admin-only control covers businesses, working schedules, busy-hour consumption multipliers, credits, users, media, campaigns, locations, screens, channels, operations, monitoring, wallets, and CSV stream reports.
- Campaign creation includes advertiser business, approved media, locations, targeting rules, budgets, frequency, dates, and direct publishing.
- Administrator media uploads auto-approve after browser/server validation. Upload progress, optional compression, automatic filenames, playback controls, fullscreen, and confirmed deletion are implemented.
- Browser streams play anonymously without a code; registered viewers can optionally identify themselves. The sign-in modal is user-invoked and does not block playback.
- `/monitor` now owns live telemetry and accepted proof-of-play evidence; `/proof` redirects to its evidence section.
- Host businesses can define recurring local-time busy periods. Accepted playback multiplies advertiser consumption, not host earning, and records the multiplier in evidence.
- Advertiser exhaustion is isolated: fresh playlists omit only media owned by businesses that cannot fund a full play, while channels and other campaigns continue.
- Operations is the only channel-video-settings control surface. The live player is read-only and supports saved visibility controls, overlay position/style, progress, accent color, scaling, and banner presentation.
- `/operation` and `/operations/channel-settings` are compatibility routes that redirect to the channel controls at `/operations#channels` instead of falling through to the custom 404 page.
- Production Supabase has the operating-schedule dependency, busy-hours/isolated-delivery, and advanced channel-video-settings migrations applied and schema-verified through `20260818233144_advanced_channel_video_settings.sql`.
- Production is served from `https://loopline-gray.vercel.app`; `loopline.vercel.app` is not an alias of this project and must not be used for verification or customer links.
- `/api/ready` verifies the required schedule, busy-period, and advanced streaming-settings schema as well as database connectivity, so future schema drift fails visibly with `503` instead of presenting valid pages as missing.
- The 2026-08-18 production verification found one admin profile, zero business memberships, three administrator functions, disabled tenant helpers, and all required administrator read policies.

## Required checks

Before publishing a change, run checks proportionate to the scope. The full beta gate is:

```powershell
pnpm test:beta
```

The last completed validation passed ESLint, the production build, media-worker checks, and all 14 Playwright tests. The production route audit also verified every dashboard route through its authentication boundary, all public utility pages, the `primary-network` stream handshake/player, and both health endpoints without a 404 or 500 response.

## Documentation and publishing discipline

- Update `CODEX.md` and relevant files under `docs/` whenever behavior, schema, architecture, security, tests, or phase status changes.
- Create database changes only as timestamped files under `supabase/migrations/` and verify the hosted state after deployment.
- Preserve unrelated user changes in a dirty worktree.
- After successful verification, commit intentionally and push the current branch to `origin` with normal `git` commands.

## Next phase

The recommended next milestone remains the reference Android TV/Google TV player and signed offline manifest flow. Campaign settlement and money-like credit features must not advance ahead of trusted device playback, replay-resistant evidence, and balanced-ledger acceptance tests.
