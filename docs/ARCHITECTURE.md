# System Architecture

## Architectural style

Use a modular monolith for the API and business logic, plus a separate media-processing worker. Keep modules isolated by explicit service/repository boundaries so they can be extracted later if scale or ownership warrants it.

The pilot uses private managed object storage through `src/lib/storage/media-storage.ts`. Database records store provider-neutral object paths, and the portal requests short-lived read URLs through this adapter. Large files upload directly from the authenticated browser, so changing storage providers later is isolated from the media domain and does not require routing video bytes through the central Worker.

Media delivery uses a hybrid model. The portal and compatible players stream private pre-recorded media through short-lived signed URLs and adaptive 720p/480p HLS renditions. Venue players will still download approved assets, verify their checksums, and keep an offline cache before scheduled playback. Streaming improves previews and first-play latency; local caching keeps the advertising loop reliable during unstable or lost connectivity. The central application authorizes playlists and redirects segments to private storage instead of proxying video bytes.

## Runtime components

```text
Business portal / Admin console (Next.js)
                   |
                   | HTTPS + session/RBAC
                   v
Modular API (TypeScript)
  - Identity & organizations
  - Devices
  - Media library
  - Campaigns & playlists
  - Playback evidence
  - Credit ledger
  - Reporting
  - Administration & audit
       |             |               |
       v             v               v
  PostgreSQL       Redis       Object storage/CDN
                                      ^
                                      |
                             FFmpeg media worker

Android TV player <--- device API / signed manifests / event batches
```

## Repository target structure

```text
apps/
  web/                 Next.js business and admin portal
  api/                 Modular API and device-facing routes
  tv/                  Kotlin Android TV player
  media-worker/        FFmpeg jobs and asset validation
packages/
  domain/              Shared TypeScript policies and types
  database/            Schema, migrations, and repository helpers
  contracts/           OpenAPI source and generated clients
  observability/       Logging, metrics, and tracing defaults
docs/                   Product and engineering documentation
infra/                  Local Docker and deployment definitions
```

The Git repository currently contains the Next.js application at its root plus a separately deployable media worker under `workers/media-processor`. The Android TV client and shared packages remain future targets. Add them when their phase begins rather than generating unused scaffolds.

## Current implemented structure

```text
src/app/(platform)   Protected portal pages and server actions
src/app/api          Health, readiness, device, and protected-media routes
src/app/stream       Browser channel player
src/components       Management forms, shell, and player UI
src/lib/repositories Server-only data reads for portal pages
src/lib/storage      Provider-isolated media and logo storage
src/lib/streaming    Channel authorization and viewer composition
src/lib/supabase     Session-aware clients and generated database types
supabase/migrations  Schema, RLS, storage policies, and privileged functions
workers/media-processor  Durable FFmpeg/HLS processor
tests                Playwright beta boundary tests
```

## Module boundaries

- Identity owns users, organizations, memberships, roles, and invitations.
- Devices owns activation, credentials, capabilities, health, commands, and suspension.
- Media owns technical validation, storage metadata, derivatives, moderation, and rights declarations.
- Channels owns named streams, ordered media, bearer viewing links, and business assignments.
- Campaigns owns budget intent, targeting, eligibility, frequency, and status.
- Playlist owns deterministic selection and signed manifest versions.
- Evidence owns device sessions/events, validation decisions, confidence, and fraud reasons.
- Ledger owns wallets, holds, balanced entries, purchases, reversals, and reconciliation.
- Reporting reads immutable facts and projections; it does not mutate financial or evidence state.
- Administration coordinates moderation/review and records all privileged actions in audit logs.

Modules communicate through application services and durable database facts, never by editing another module's tables directly.

## Critical settlement transaction

Inside one PostgreSQL transaction:

1. Lock or insert the settlement idempotency record.
2. Return the original response if already completed.
3. Verify the playback decision is eligible for settlement.
4. Lock campaign hold and relevant wallet projections.
5. Create a balanced ledger transaction and entries.
6. Mark the playback settled with transaction ID and policy version.
7. Consume/release the hold and update projections.
8. Commit.

Any failure rolls back every step.

## Portal implementation decisions

- Next.js App Router and TypeScript
- Server Components by default; client boundary limited to interactive shell/navigation
- Direct server-side repository reads for the portal when persistence is connected
- Route handlers reserved for Android/external API contracts and webhooks
- CSS design system in `globals.css` for the prototype; extract primitives when reuse stabilizes
- Responsive layout supports desktop operations and mobile venue management

## Deployment baseline

- Standard Next.js runtime with no required hosting-provider adapter
- Direct Vercel deployment for the current environment
- Portable standalone Node.js container for other managed platforms
- Managed PostgreSQL with point-in-time recovery
- Managed Redis for presence, rate limits, queues, and short locks
- S3-compatible object storage with versioning and CDN
- Signed private CDN delivery with byte ranges and adaptive HLS renditions
- Separate worker process with bounded CPU/memory and a job queue
- Structured logs, metrics, traces, error tracking, uptime checks, and alert routing

## Scaling triggers

Extract a module only when at least one is true:

- Its reliability or scaling profile is materially different
- A separate team owns it
- Database or deployment contention is measured
- Security isolation requires a separate boundary

Media processing is separated from day one because it is CPU-heavy and failure-prone compared with transactional API work. Hosting-specific deployment files remain adapters at the repository boundary and cannot be imported by product or domain modules.

The media processor is a separately deployable Node.js/FFmpeg container under `workers/media-processor`. Submission commits a durable PostgreSQL job in the same transaction as the asset state change. Workers claim jobs atomically with `FOR UPDATE SKIP LOCKED`, verify the original SHA-256 and technical metadata, create an H.264/AAC fast-start MP4, JPEG thumbnail, and adaptive 720p/480p HLS package, upload versioned derivatives, and complete or retry the job through server-only database functions. A crashed worker lease becomes reclaimable after 30 minutes; exhausted jobs fail visibly instead of remaining stuck.

Streaming channels are independent network objects. An administrator can create or delete channels, assign any number of active businesses, and place approved media into an ordered loop. The viewer URL contains a channel ID and independent access key; invalid credentials fail closed. Database tables remain inaccessible to anonymous clients, while the server authorizes each asset before issuing short-lived storage access.

Business branding is stored separately from advertising media. Logos live in a public presentation-assets bucket because the public player must render them without exposing private advertising objects. Upload, replacement, deletion, and database association remain administrator-only. Each organization controls logo position and relative size; each channel controls whether advertiser logos and other information layers are rendered.

The dashboard header resolves the first channel visible to the signed-in user through a server-only repository. Search and guide navigation stay client-side, while the Live Beta URL is never hard-coded into the shell. The public stream permits anonymous playback with its bearer access key, but optional administrator authentication is checked separately before rendering the in-player settings control.
