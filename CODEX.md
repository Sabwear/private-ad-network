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
- Uploaded and YouTube players refresh playlist eligibility at each media boundary, so newly funded ads join an already-open stream without requiring a manual page reload.
- `/monitor` now owns live telemetry and accepted proof-of-play evidence; `/proof` redirects to its evidence section.
- Host businesses can define recurring local-time busy periods. Accepted playback multiplies advertiser consumption, not host earning, and records the multiplier in evidence.
- Advertiser exhaustion is isolated: fresh playlists omit only media owned by businesses that cannot fund a full play, while channels and other campaigns continue.
- The Wallet page can grant administrator-audited promotional credits through balanced ledger entries and now provides a per-business credit registry with lifetime funding/spend totals, wallet-source balances, funder identity and reason, campaign position, and playback-level spend evidence. Operations labels unfunded channel items with the exact base credits required instead of silently implying they are live.
- Floating editors and popups share dismiss behavior: a visible Close control, Escape, outside click, and opening another popup all close the current surface. Header search/guide/notification/account menus and the optional viewer-login dialog also dismiss outside or by Escape.
- Operations is the only channel-video-settings control surface. The live player is read-only and supports saved visibility controls, overlay position/style, progress, accent color, scaling, and banner presentation.
- `/operation` and `/operations/channel-settings` are compatibility routes that redirect to the channel controls at `/operations#channels` instead of falling through to the custom 404 page.
- Production Supabase is applied and schema-verified through `20260820183230_allow_admin_wallet_spend_evidence.sql`, including the authenticated administrator policy required by the security-invoker wallet report, audited credit grants, and demo advertiser funding.
- Password-based production database access is available through the ignored `.env.database.local` `SUPABASE_DB_URL`; use `db:query:direct`, `db:migrations:direct`, `db:push:direct:check`, and `db:push:direct`. Never copy the credential into tracked files or output.
- Hosted migration history was verified on 2026-08-20: all 34 local and remote versions match, and the direct push dry run reports the database is up to date.
- Production is served from `https://loopline-gray.vercel.app`; `loopline.vercel.app` is not an alias of this project and must not be used for verification or customer links.
- `/api/ready` verifies the required schedule, busy-period, and advanced streaming-settings schema as well as database connectivity, so future schema drift fails visibly with `503` instead of presenting valid pages as missing.
- The 2026-08-18 production verification found one admin profile, zero business memberships, three administrator functions, disabled tenant helpers, and all required administrator read policies.

## Required checks

Before publishing a change, run checks proportionate to the scope. The full beta gate is:

```powershell
pnpm test:beta
```

The last completed validation passed ESLint, the production build, media-worker checks, and all 15 Playwright tests, including viewer-login dismissal by Escape, Close, and backdrop. The production route audit also verified every dashboard route through its authentication boundary, all public utility pages, the `primary-network` stream handshake/player, and both health endpoints without a 404 or 500 response.

## Documentation and publishing discipline

- Update `CODEX.md` and relevant files under `docs/` whenever behavior, schema, architecture, security, tests, or phase status changes.
- Create database changes only as timestamped files under `supabase/migrations/` and verify the hosted state after deployment.
- Preserve unrelated user changes in a dirty worktree.
- After successful verification, commit intentionally and push the current branch to `origin` with normal `git` commands.

## Next phase

The recommended next milestone remains the reference Android TV/Google TV player and signed offline manifest flow. Campaign settlement and money-like credit features must not advance ahead of trusted device playback, replay-resistant evidence, and balanced-ledger acceptance tests.
