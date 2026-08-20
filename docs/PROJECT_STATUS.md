# Project Status and Next-Phase Handoff

Last reviewed: 2026-08-20

## Current product state

Loopline is a centrally administered private advertising network. The Next.js portal is backed by Supabase PostgreSQL, Auth, and Storage, with a separately deployable FFmpeg media worker. Businesses, locations, screens, campaigns, media, channels, stream settings, viewers, and credits are controlled by platform administrators from one dashboard.

The portal is suitable for controlled administrator testing. It is not yet ready for unattended physical-screen deployment, financial settlement, or production claims about verified device playback.

## Authority model

- Active platform administrators are the only dashboard users.
- Businesses are records managed by administrators; no user owns or is assigned to a business.
- The legacy organization-membership model is disabled and its assignments were removed.
- Non-admin authenticated accounts are approved viewers used only for optional registered stream identity.
- Anonymous stream playback remains available and does not require sign-in or a business code.
- Every dashboard server action and repository operates across the centrally managed platform and enforces administrator access.

## Completed capabilities

### Administration and business operations

- Administrator-only business creation, profile editing, schedules, recurring busy-hour spend multipliers, suspension, branding, stream codes, earning toggles, and per-business earn/spend rates
- Administrator-created admin or viewer accounts; public registration remains approval-controlled
- Platform-wide locations, screens, channels, media, campaigns, wallets, user sessions, and monitoring
- Locations and targeting rules embedded in campaign configuration
- Channel link management, business targeting, playlist management, centralized Operations video controls, configurable overlays/progress/accent, and synchronized server-clock playback
- Operations funding eligibility for every channel item, plus administrator promotional-credit grants backed by balanced ledger entries and audit records
- Professional wallet intelligence with one business-level registry, current source balances, exact lifetime funding and spend, latest funder, administrator/reason attribution, campaign position, and drill-down funding and playback-spend histories
- Stable compatibility redirects from singular Operation and the explicit channel-settings path to the Operations channel controls
- Dedicated Monitor workspace with viewers, geography, uptime, channels, credit movement, database/runtime status, alerts, handling controls, and accepted proof-of-play evidence

### Media and campaigns

- Resumable upload with progress, optional browser compression, automatic filename/title, checksum, and technical validation
- Flexible video duration, MP4 validation, playback/fullscreen/mute/pause controls, and confirmed deletion
- Administrator uploads and supported YouTube references approve directly; no redundant review workflow
- Durable FFmpeg worker for normalized MP4, thumbnails, adaptive HLS, retries, and stale-job recovery
- Responsive campaign create/edit flow with advertiser, approved media, dates, budgets, frequency, locations, targeting, and direct publishing

### Viewer streaming

- Anonymous playback starts normally from a valid channel link
- Existing viewers refresh funding eligibility whenever an uploaded or YouTube item ends, allowing newly funded assigned media into the next resolved loop
- Optional login control opens the registered-viewer modal; dismissing or ignoring it never blocks playback
- The public player is read-only; administrators configure viewer controls and presentation only from each channel's Operations panel
- Registered viewers use administrator-approved accounts
- Viewer sessions, locations, verified seconds, rejected events, and credit movement feed administrator monitoring and CSV export
- Host-venue busy periods multiply advertiser consumption in local time and are captured in evidence; exhausted advertisers are removed individually without pausing channels or other campaigns

## Database and deployment state

- Hosted schema is applied and verified through `20260820182633_fix_admin_wallet_report_media_name.sql`, including the read-only, security-invoker administrator wallet RPC. All 33 local and hosted migration versions match and the direct push dry run reports no pending migrations.
- Production verification on 2026-08-18: one admin, zero organization memberships, tenant helpers disabled, three new admin functions installed, and admin read policies present.
- Production database access is configured through an ignored password-based session-pooler URL. Hosted migration history matches all 31 local files, and direct CLI query/list/advisor/dry-run/push helpers are available.
- Vercel remains the web host at `https://loopline-gray.vercel.app`. The similarly named `loopline.vercel.app` domain is not attached to this project. The media worker requires a separate long-running worker host.
- The repository remote is `origin` on GitHub; completed work must be committed and pushed after verification.

## Validation state

- ESLint: passed
- Next.js production build: passed
- Media processor checks: 3 passed
- Playwright end-to-end suite: 14 passed
- Production route audit: all dashboard routes reached sign-in, public utility pages returned `200`, `primary-network` completed anonymous access into the player, and health/readiness returned `200`
- Git diff whitespace validation: passed

## Known gaps before external beta

1. Deploy and continuously monitor the media processor.
2. Configure production hostname/callbacks, custom SMTP, leaked-password protection, and administrator MFA.
3. Add hosted integration coverage for admin authorization, invitations, device pairing, media processing, channel rotation, and database restore.
4. Publish the viewer/session telemetry privacy notice and retention policy.
5. Replace or clear demo data before onboarding real businesses.

## Recommended next phase

Start the reference Android TV/Google TV player and signed-manifest phase:

1. Select and document one reference device.
2. Create the Kotlin/Compose TV app with Media3, Room, and OkHttp.
3. Reuse activation and add renewable, revocable device credentials.
4. Publish signed, versioned channel manifests containing hashes, expiry, nonces, ordering, and fallback media.
5. Download, verify, cache, and loop approved assets offline.
6. Add boot recovery, reconnect behavior, maintenance exit, and remote revocation.
7. Pass corrupt-file, power-cycle, outage, restart, and 72-hour endurance tests.

Do not enable financial settlement until device playback, evidence idempotency, replay resistance, and balanced-ledger acceptance tests pass.

## Handoff checklist

- Update `CODEX.md` and this file.
- Update architecture, data model, API, security, testing, and ADR documents when affected.
- Add timestamped Supabase migrations for schema changes and verify hosted state.
- Run `pnpm test:beta` or document narrower checks.
- Commit intentionally and push the completed branch to GitHub.
