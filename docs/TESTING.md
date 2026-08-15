# Testing Strategy

## Current beta gate

Run from the repository root:

```bash
pnpm test:beta
```

This gate performs linting, media-worker type checks, a production Next.js build, and Playwright browser tests. GitHub Actions additionally builds the FFmpeg container and generates a real adaptive 720p/480p HLS fixture.

The browser suite currently verifies:

- Service health and no-cache behavior
- Protected-route redirect to sign-in
- Invitation-only signup boundary
- Non-disclosure for malformed private stream credentials
- Browser security headers
- Login usability on a phone-sized viewport

The following authenticated smoke checks were completed manually for the current beta build and should be automated next:

- Business information persists through the audited administrator action
- Reassigning the same business ad to the same channel is idempotent
- Channel display settings persist from Channels and the in-player settings drawer
- Public stream viewers do not receive the administrator settings control
- Dashboard search filters routes and supports Enter navigation
- Guide and notification panels open exclusively and their links navigate correctly
- Live Beta resolves the active channel dynamically and opens its player
- The stream player reports no browser console errors during the smoke path

The hosted beta also contains a removable demo dataset for authenticated workflow testing. Verify the Overview, Business, Locations, Screens, Media, Campaigns, Channels, and public stream pages before clearing it. Demo cleanup must require the acknowledgement, exact phrase, final confirmation dialog, administrator session, and server-side demo marker.

Database migrations must be reviewed against the linked hosted project before deployment. Authorization coverage must continue to verify that ordinary accounts cannot create organizations, pending accounts cannot enter a workspace, owners are limited to their organization, and platform administrators alone can provision audited tenants.

## Required next test layers

### Hosted integration

- Administrator invitation, account suspension, and live-session revocation
- Business, location, and role isolation under row-level security
- Pairing-code single use, expiry, credential suspension, and heartbeat idempotency
- Private upload lifecycle, moderation boundaries, and worker retry/recovery
- Channel assignment isolation and access-key rotation
- Business-logo upload/delete authorization, file limits, and overlay placement
- Channel-overlay persistence and administrator-only in-player controls
- Header live-channel resolution for administrators, assigned businesses, and users with no visible channel

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
