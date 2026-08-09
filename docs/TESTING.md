# Testing Strategy

## Test layers

### Unit

- Credit calculation and decimal precision
- Eligibility and frequency caps
- Weighted round-robin determinism
- Completion threshold and checkpoint rules
- Fraud reason scoring
- Ledger balancing and reversal construction
- Manifest canonicalization and signature verification

### Integration

- PostgreSQL constraints and concurrent settlement
- Campaign holds under concurrent completions
- Device sequence and idempotency handling
- Object storage upload lifecycle and worker callbacks
- Policy-version persistence
- Authorization and organization isolation

### Contract

- OpenAPI validation for portal and Android clients
- Backward compatibility of device API fields
- Stable error and decision reason codes
- Signed manifest/event fixtures validated in TypeScript and Kotlin

### End-to-end portal

- Business onboarding and approval
- Device pairing
- Media upload and moderation
- Campaign creation/pause/resume
- Wallet statement and exports
- Admin playback review and reversal
- Keyboard navigation, mobile layout, and accessibility smoke tests

### Android TV

- Cold boot, restart, sleep/wake, power loss, and storage pressure
- Corrupt/unsupported/missing asset and checksum failure
- No internet on start, mid-play outage, and long reconnect
- Duplicate event upload and clock manipulation
- Foreground exit attempt and credential expiry
- At least 72 continuous hours on reference hardware
- Supported Android versions, HDMI displays, and low-cost device performance

## Non-negotiable concurrency tests

1. Multiple completion requests for one playback create one settlement.
2. A lost response followed by identical retry returns the original result.
3. Reusing an idempotency key with different content is rejected.
4. Advertiser holds prevent overspend under simultaneous screens.
5. Every committed ledger transaction balances.
6. Reversal references the original and restores the intended economic position.
7. Restore from backup reproduces wallet projections and playback links.

## End-to-end acceptance fixture

1. Create and approve Businesses A and B and one location/screen each.
2. Pair each TV to its location.
3. Business A uploads a 30-second asset; worker normalizes it; moderator approves it.
4. Business A receives starter credits and starts a campaign targeting Business B.
5. Business B receives a signed manifest and downloads the correct checksum.
6. Player reports start, checkpoints, heartbeats, and completion.
7. Server accepts the session and creates one balanced transaction.
8. A sees spend, B sees earnings, and admin sees the evidence timeline.
9. Replaying the same batch creates no second settlement.
10. Turning off/closing B's player stops earnings and raises an alert.

## Pilot performance targets

| Measure | Target |
| --- | --- |
| Crash-free player sessions | ≥ 99.5% |
| Acceptance of technically completed plays | ≥ 98% |
| Heartbeat status freshness | ≤ 90 seconds |
| Manifest propagation | ≤ 5 minutes |
| Local cached media startup | ≤ 2 seconds |
| Unbalanced settlements | 0 |
| Duplicate settlements | 0 |

## Current web checks

Run from `apps/web`:

```bash
pnpm lint
pnpm build
pnpm build
```

Database migrations must parse successfully and be dry-run against the linked hosted project before deployment. Authorization coverage must verify that ordinary accounts cannot create organizations, pending accounts cannot enter a workspace, owners are limited to their own organization, and platform administrators can provision audited tenants.

Playwright coverage begins with the account-registration and protected-route boundaries, then expands to administrator provisioning and location management after the hosted migration is deployed.
