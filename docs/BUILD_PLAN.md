# Build Plan and Backlog

## Delivery strategy

Build a thin, end-to-end trust loop first. Expand breadth only after a real device can complete one authorized play and produce one explainable, balanced settlement.

## Phase 0 - Product foundation (completed/in progress)

Outcome: shared language, working defaults, architecture, and a navigable central-platform prototype.

- [x] Analyze business and technical blueprint
- [x] Define product policy defaults
- [x] Create architecture, data, API, security, testing, and pilot documents
- [x] Build responsive central portal shell
- [x] Prototype business and admin workflows with typed domain data
- [x] Add a dedicated administrator-only Business workspace and align navigation to the operating flow
- [ ] Confirm working product name and pilot city
- [ ] Purchase two identical Android TV reference boxes
- [ ] Review credit and advertising terms with local counsel/accountant

## Phase 1 - Platform foundation (weeks 1-3)

Outcome: real users, organizations, locations, and devices stored in PostgreSQL.

- [x] Create versioned PostgreSQL schema and migrations
- [x] Deploy versioned migrations to the hosted database
- [ ] Link the local CLI and reconcile hosted migration history
- [x] Add authentication and cookie-based session handling
- [x] Disable public signup and add administrator-created owner invitations
- [x] Add user permission controls, account suspension, and observed live-session activity
- [x] Load organization membership and enforce initial portal roles
- [x] Define separate platform-administrator authority and pending-account isolation
- [ ] Enforce admin MFA for privileged operations
- [x] Implement admin-only organization creation and owner assignment
- [x] Implement initial location creation, operating hours, categories, zones, and traffic bands
- [x] Add administrator organization editing and suspension
- [x] Add location editing, suspension, and category exclusions
- [ ] Extend administrator invitations from owners to business staff
- [x] Implement short-lived device activation codes, key registration, hashed credentials, heartbeat telemetry, and suspension
- [ ] Add automatic device credential rotation and refresh credentials
- [ ] Replace remaining demonstration portal data with server-side repository queries
- [x] Record privileged organization and location actions in the database audit log
- [ ] Add an administrator audit-log viewer
- [ ] Add Docker development environment for PostgreSQL, Redis, and object storage

Acceptance: an administrator can create an organization and assign its owner; that owner can sign in, create a location, pair a simulated device, and see its heartbeat.

## Phase 2 - Media and first playback (weeks 4-5)

Outcome: one approved file is delivered and played locally on a reference device.

- [x] Create tenant-scoped direct upload flow to a private object-storage bucket
- [x] Add browser playback preflight, duration/dimension rules, and SHA-256 integrity checksum
- [x] Add rights declaration, submission, administrator moderation, rejection reasons, and audit records
- [x] Keep storage-specific reads behind a replaceable media storage adapter
- [ ] Add FFmpeg worker for validation, normalization, checksum, thumbnail, and streaming renditions
- [x] Add resumable, retryable uploads with progress for pilot media files
- [ ] Add secure byte-range delivery for portal previews and compatible players
- [ ] Generate adaptive HLS renditions and short-lived signed playback URLs
- [ ] Implement a dedicated non-admin moderator role and queue
- [ ] Create Android TV project using Kotlin, Compose for TV, Media3, Room, and OkHttp
- [ ] Implement activation, manifest fetch, streamed preview, asset download, checksum, cache, and fallback media
- [ ] Keep approved advertising assets cached locally for uninterrupted venue playback when connectivity is degraded
- [ ] Implement boot recovery, foreground playback, and protected maintenance exit

Acceptance: an approved asset is uploaded in the portal, moderated, downloaded by one TV, and loops locally without buffering.

## Phase 3 - Campaigns and playlists (weeks 6-7)

Outcome: campaign rules produce a deterministic signed device playlist.

- Persist campaigns, targeting, dates, total/daily budgets, and frequency caps
- Implement credit holds before campaign activation
- Implement eligibility filters and self-display exclusion
- Implement weighted round-robin and under-delivery weighting
- Create signed, versioned manifests with validity, hashes, nonces, and fallback
- Add emergency asset removal and manifest invalidation
- Show campaign delivery forecast and fill indicators

Acceptance: two advertisers share a loop fairly, excluded screens receive no assignment, and campaign pause propagates within five minutes.

## Phase 4 - Evidence and ledger (weeks 8-10)

Outcome: verified playbacks settle exactly once and can be audited.

- Implement sessions, ordered event batch ingestion, and per-device sequence uniqueness
- Validate assignment, duration, checkpoint order, foreground/display state, and signature
- Implement hash-chain and duplicate/replay detection
- Add accepted/held/rejected policy outcomes and reason codes
- Implement double-entry wallets, holds, settlement, release, fee, reversal, and adjustment
- Use one PostgreSQL transaction for evidence decision and ledger settlement
- Implement administrator evidence timeline and controlled review
- Add business statements and CSV export

Acceptance: the blueprint's ten-step end-to-end scenario passes, including replaying the same batch without a second settlement.

## Phase 5 - Offline and operational hardening (weeks 11-12)

Outcome: pilot-ready reliability on physical hardware.

- Implement Room event queue with monotonic sequence and previous-event hash
- Upload compressed idempotent batches after reconnection
- Enforce six-hour offline earning limit
- Add display state, storage, network, app version, and crash telemetry
- Add remote refresh, resync, maintenance, cache clear, and restart commands
- Add alerting, structured logs, traces, error reporting, backup, and restore rehearsal
- Run 72-hour endurance test, power-cycle tests, and network-loss matrix
- Create operational runbooks and installation checklist

Acceptance: a device survives outage and restart, synchronizes once, and remains diagnosable remotely.

## Phase 6 - Controlled pilot (4 operational weeks)

Outcome: validate trust, reliability, and commercial intent with 5-10 businesses and 5-15 screens.

- Install in one friendly venue before external rollout
- Onboard complementary venues with documented screen placement
- Review active-screen rate, verified minutes, fill rate, earn/spend ratio, crash-free playback, disputes, and retention weekly
- Interview partners weekly and track support cost
- Freeze risky features during the pilot; prioritize reliability and explainability
- Decide membership and credit-pack pricing from observed supply/demand

## Explicitly deferred

- Real-time bidding or auctions
- Blockchain or public tokens
- Cameras and audience identification
- Tizen or webOS players
- Cash redemption
- Microservices per domain
- Live-event broadcasting; pre-recorded ads use secure adaptive streaming plus local device caching
- Complex multipliers or AI scheduling
