# Testing Strategy

## Current beta gate

Run from the repository root:

```bash
pnpm test:beta
```

This gate performs linting, media-worker type checks, a production Next.js build, and Playwright browser tests. GitHub Actions additionally builds the FFmpeg container and generates a real adaptive 720p/480p HLS fixture.

The browser suite currently verifies:

- Service health and no-cache behavior
- Exhaustive dashboard-route resolution through the sign-in boundary
- Public login, password recovery, and device setup reachability
- Invitation-only signup boundary
- Non-disclosure for malformed private stream credentials
- Browser security headers
- Login usability on a phone-sized viewport
- Administrator authentication required for business creation, media upload, monitoring, and viewer CSV reporting
- Anonymous stream access does not require a business code
- Viewer access validation rejects malformed requests without exposing credentials
- Stream heartbeat and termination require a validated viewer cookie
- Dedicated Monitor authentication and legacy Proof URL compatibility
- Operation and channel-settings compatibility paths redirect through the protected Operations route
- The Wallet route remains administrator-only; authenticated wallet verification should additionally cover business selection, exact ledger totals, funder attribution, and detailed playback-spend evidence from `get_admin_wallet_report`

The 2026-08-20 hosted route audit also verified the canonical `https://loopline-gray.vercel.app` deployment. Every dashboard path redirected to sign-in without a 404/500, public utility pages returned `200`, `/watch/primary-network` completed anonymous access and rendered the player, and `/api/health` plus the schema-aware `/api/ready` returned `200`.

The 2026-08-20 playlist funding verification confirmed three serialized items in `primary-network`, 5,000 promotional credits for each newly funded demo advertiser, two posted two-entry grant transactions with a zero balance, aligned migration history, and no Supabase security-advisor findings. The existing unrelated duplicate permissive profile-read policy remains a performance warning.

The following authenticated smoke checks were completed manually for the current beta build and should be automated next:

- Business information persists through the audited administrator action
- Reassigning the same business ad to the same channel is idempotent
- Channel video settings persist from the dedicated Operations panel and are reflected by the read-only player
- A refreshed or newly opened viewer seeks to the shared channel position instead of restarting at the first frame
- Continuous broadcast can enter standby and resume from Operations; resume creates a new broadcast epoch
- Public stream viewers never receive an administrator settings mutation control
- Dashboard search filters routes and supports Enter navigation
- Guide and notification panels open exclusively and their links navigate correctly
- Live Beta resolves the active channel dynamically and opens its player
- The stream player reports no browser console errors during the smoke path
- Platform administrators can choose an advertiser business and switch between private MP4 and YouTube source forms
- Unsupported external URLs fail closed without creating a media row
- Approved YouTube items use the shared channel offset, seek/play commands, audio control, and existing information overlays

The hosted beta also contains a removable demo dataset for authenticated workflow testing. Verify the Overview, Business, Locations, Screens, Media, Campaigns, Channels, and public stream pages before clearing it. Demo cleanup must require the acknowledgement, exact phrase, final confirmation dialog, administrator session, and server-side demo marker.

Database migrations must be reviewed against the hosted project before deployment. Authorization coverage must continue to verify that viewer accounts cannot enter or mutate the dashboard, businesses grant no user authority, anonymous stream playback remains available, and only active platform administrators can perform management operations.

## Required next test layers

### Hosted integration

- Administrator/viewer invitation, viewer suspension, and live-session revocation
- Administrator-only business, busy-period, location, campaign, media, channel, wallet, and monitoring mutations under row-level security
- Pairing-code single use, expiry, credential suspension, and heartbeat idempotency
- Private upload lifecycle, direct administrator approval, deletion, and worker retry/recovery
- YouTube URL variants, duplicate prevention, rights enforcement, direct administrator approval, embed availability, duration drift, and removal/unavailability recovery
- Channel assignment isolation and access-key rotation
- Business-logo upload/delete authorization, file limits, and overlay placement
- Channel-video-setting persistence, Operations-only mutation, overlay variants, progress, accent color, and conditional player controls
- Shared-timeline late join across independent viewers, authorized clock synchronization, repeated-loop rollover, background-tab recovery, drift correction, standby/resume, and unavailable-source retry
- Header live-channel resolution for administrators and viewer-dashboard exclusion
- Busy-period overlap rejection, local-time multiplier settlement, proof evidence, and per-advertiser exhaustion without channel interruption
- Wallet-report lifetime aggregation, history limits, administrator identity attribution, multi-wallet spend splits, and viewer-account denial

### Device endurance

- Cold boot, restart, sleep/wake, power loss, and storage pressure
- Corrupt, unsupported, missing media, and checksum failure
- Offline startup, mid-play outage, and long reconnect
- At least 72 continuous hours on reference hardware

### Future financial scope

Before wallets or proof are enabled, add concurrent settlement, idempotency, balanced-ledger, reversal, reconciliation, and backup-restore tests. No financial feature may move out of the disabled beta state without those gates.

## Initial service targets

| Measure | Beta target |
| --- | --- |
| Portal health availability | 99.5% |
| Heartbeat status freshness | 90 seconds or less |
| Adaptive channel startup | 5 seconds or less on test network |
| Cross-business data exposure | 0 |
| Unrecoverable player errors in 72-hour test | 0 |
