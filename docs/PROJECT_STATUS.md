# Project Status and Next-Phase Handoff

Last reviewed: 2026-08-16

## Current product state

Loopline is a working limited-beta central platform for managing a private, multi-business advertising network. The deployed web application is a standard Next.js application backed by Supabase PostgreSQL, Auth, and Storage. It is currently hosted on Vercel but does not depend on Vercel-specific application APIs.

The central portal is suitable for controlled administrator testing. It is not yet ready for paid campaign activation, unattended physical-screen deployment, financial settlement, or production claims about verified playback.

## Completed capabilities

### Identity and access

- Cookie-based server-rendered authentication, password recovery, and protected application routes
- Invitation-controlled access with unassigned-account isolation
- Platform administrator authority, organization roles, account suspension, permission controls, and observed session activity
- Administrator-managed business creation and owner assignment
- Row-level security and audited privileged database functions

### Business and venue operations

- Business registry, profile editing, suspension, contact details, website, and category
- Business-logo upload with type/size validation and administrator-only storage mutations
- Configurable advertiser-logo position and size for stream overlays
- Location creation and editing, operating hours, zones, traffic bands, and content exclusions
- Device activation codes, pairing status, credential hashing, IP/client metadata, heartbeat telemetry, and suspension

### Media and streaming

- Resumable private media uploads, client preflight, checksum, rights declaration, and moderation
- Business-scoped YouTube submissions with strict URL parsing, declared duration, rights confirmation, moderation, and privacy-enhanced embedded playback
- Durable FFmpeg worker for validation, normalized MP4, thumbnails, retry recovery, and 720p/480p HLS
- Protected media delivery with short-lived storage access
- Multiple streaming-channel schema and management UI; one seeded Primary Network Channel is active for beta
- Ordered approved-media playlists and business-to-channel assignments
- Business-owned ad-to-channel assignment controls
- Configurable stream overlays: live badge, channel title, now playing, audio, advertiser logos, stripe banner, video time, and contain/cover scaling
- Administrator-only in-player settings drawer; public viewers cannot access it
- Persistent server-clock channel timelines: late viewers and page reloads join the current point in the ad loop, with periodic drift correction and an administrator standby/resume control

### Campaigns and administration

- Campaign draft creation, editing, and deletion with advertiser ownership, approved media, targets, dates, budgets, and frequency limits
- Real repository-backed Overview metrics and operational pages
- Removable protected demo dataset with double confirmation
- Functional dashboard header search, operating Guide, notifications panel, and Live Beta stream shortcut
- Health/readiness endpoints and platform-independent deployment configuration

## Current repository structure

```text
.
|-- src/
|   |-- app/
|   |   |-- (platform)/       Authenticated dashboard pages and server actions
|   |   |-- api/              Health, readiness, device, and protected media routes
|   |   |-- auth/             Authentication callback
|   |   |-- device/setup/     Screen activation client
|   |   `-- stream/           Protected browser channel player
|   |-- components/           Interactive management and player components
|   `-- lib/
|       |-- auth/             Workspace, role, redirect, and optional-admin checks
|       |-- device/           Client/network telemetry helpers
|       |-- media/            Constrained external-media parsing and playback helpers
|       |-- repositories/     Server-only page data access
|       |-- storage/          Media and business-logo storage adapters
|       |-- streaming/        Channel authorization and public-player data
|       `-- supabase/         Browser/server/admin clients and generated types
|-- supabase/
|   |-- migrations/           Versioned database, RLS, function, and storage changes
|   `-- demo_seed.sql         Repeatable beta dataset
|-- workers/media-processor/  Separately deployable Node.js/FFmpeg worker
|-- tests/                    Playwright beta tests
|-- docs/                     Product, architecture, security, and delivery records
|-- Dockerfile                Portable standalone web deployment
`-- .github/workflows/        Application validation
```

The future Android TV application and shared contract packages have not been created. Their intended boundaries remain documented in `ARCHITECTURE.md`.

## Environment and deployment state

- Hosted database migrations are applied through `20260815235423_admin_media_ingestion.sql`.
- Supabase is the current database, authentication, and temporary object-storage provider.
- Vercel is the current web host; the application also supports standalone Node.js container deployment.
- The media worker must run on a separate worker-capable host. A normal Vercel web deployment does not run FFmpeg jobs continuously.
- The hosted project contains removable demo content for beta verification.
- YouTube playback depends on the source remaining available, embeddable, and unchanged; exact duration is currently declared at submission and verified during moderation.
- The local Supabase CLI is not yet linked and its migration history still needs reconciliation with the hosted project.

## Known gaps and risks

### Must complete before external beta

1. Deploy and monitor the media processor continuously.
2. Configure the production hostname, authentication callbacks, custom SMTP, leaked-password protection, and administrator MFA.
3. Add hosted integration tests for tenant isolation, invitations, device pairing, media processing, and channel-key rotation.
4. Exercise database backup and restore and document the operational result.
5. Publish a tester privacy notice covering IP, browser, device, operating-system, and session telemetry.
6. Replace or clear demo data before onboarding real clients.

### Core product work still missing

- Native Android TV player, offline asset cache, signed manifests, boot recovery, and maintenance mode
- Device credential rotation and remote commands
- Business staff invitations beyond the initial owner
- Administrator audit-log viewer and dedicated moderator queue
- Campaign activation, credit holds, eligibility, deterministic scheduling, pause propagation, and delivery forecasts
- Playback evidence ingestion, validation, replay protection, and review
- Double-entry wallet, settlement, reversals, reconciliation, statements, and exports
- Production observability, alerting, endurance testing, and incident runbooks

## Recommended next phase

Start **Phase 2B: reference-device playback and signed manifests** before enabling campaign activation or finance.

Deliverables, in order:

1. Select one Android TV/Google TV reference box and document its hardware/OS baseline.
2. Create the Kotlin/Compose TV application with Media3, Room, and OkHttp.
3. Reuse the existing activation flow to register the device and issue renewable credentials.
4. Add a versioned, signed channel-manifest endpoint with asset hashes, expiry, nonce, ordering, and fallback media.
5. Download approved assets, verify checksums, maintain an offline cache, and play locally without network dependence.
6. Add boot recovery, foreground playback, maintenance exit, and device credential rotation.
7. Run power-cycle, offline/reconnect, corrupt-file, and 72-hour endurance tests.

Exit condition: one physical screen can activate, receive an authorized manifest, cache its assigned channel, loop approved media offline, recover after restart, and report health without cross-business access.

## Later phase order

1. Campaign activation and deterministic delivery
2. Playback evidence and replay-resistant ingestion
3. Atomic credit ledger and settlement
4. Operational hardening and controlled commercial pilot

Do not enable money movement until device playback, evidence idempotency, and balanced-ledger acceptance tests are complete.

## Handoff checklist for every completed phase

- Update this file and `BUILD_PLAN.md` with completed and remaining work.
- Update `ARCHITECTURE.md` if boundaries, runtimes, or hosting assumptions changed.
- Update `DATA_MODEL.md` and `API_CONTRACT.md` with schema or external contract changes.
- Update `SECURITY.md` for new permissions, telemetry, secrets, or public surfaces.
- Update `TESTING.md` and automated coverage for the new acceptance criteria.
- Add an ADR to `DECISIONS.md` for durable product or architecture choices.
- Run `pnpm test:beta` or document the narrower checks and any environment limitation.
- Commit intentionally and push the completed work to GitHub.
