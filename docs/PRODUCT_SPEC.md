# Product Specification

## Product statement

Loopline is a verified local media exchange. Businesses contribute controlled screen inventory, earn service credits for accepted playback, and use earned or purchased credits to advertise across other eligible locations.

The product sells verified broadcasting time and completed plays. It does not claim that a person watched an ad or guarantee audience size.

## Primary users

### Platform administrator

Manages the complete platform: businesses, branches, media, campaigns, screens, channels, stream operations, viewers, wallets, reports, and controlled financial settings. All privileged actions are authenticated and audited.

### Registered viewer

An administrator-approved account used only when a stream viewer chooses identified viewing. It has no dashboard or business-management access.

### Anonymous viewer

Watches a valid private channel link without registering or signing in. Only anonymous operational session evidence is recorded.

## Core workflows

### Business onboarding

1. A platform administrator verifies a prospective business offline.
2. The administrator creates the business record, schedules, locations, screens, branding, stream access, and credit rules.
3. If identified viewing is needed, the administrator separately invites a viewer account.
4. A pilot credit allocation prevents an empty campaign loop.

Public signup is disabled. Businesses do not receive accounts or dashboard ownership.

### Screen activation

1. Unpaired TV displays a short-lived activation code.
2. An administrator selects the location and enters the code in the portal.
3. Device creates a key pair and registers the public fingerprint.
4. Backend issues short-lived credentials and the initial signed manifest.
5. Screen appears online after its first valid heartbeat.

### Media approval

1. An administrator selects the advertiser business and receives a direct upload URL.
2. Worker validates malware, format, duration, dimensions, codec, checksum, and audio.
3. Worker transcodes to the pilot format and creates a thumbnail.
4. A valid administrator upload approves directly; technical failures remain visible for correction.
5. Approved media becomes eligible for campaigns.

### Campaign delivery

1. An administrator selects the advertiser, approved media, dates, budget, locations, targeting rules, and frequency cap.
2. Platform reserves campaign credits.
3. Scheduler selects eligible campaigns using weighted round-robin.
4. Device receives a versioned, signed manifest and downloads missing assets.
5. Delivery stops when dates, approval, eligibility, or spendable credits no longer permit it.

### Playback settlement

1. Device opens a session using an assigned asset and server nonce.
2. Device sends start, checkpoints, heartbeats, and completion.
3. Proof engine verifies assignment, sequence, timing, signature, screen/app state, policy, and duplication.
4. Result is accepted, held, or rejected.
5. Accepted completion creates exactly one balanced ledger transaction.
6. Advertiser, host, and administrator see the same evidence-linked result.

### Private web streaming

1. A viewer opens a valid private channel link and playback starts anonymously without a code or login wall.
2. The viewer may open the login control and identify with an email-verified account approved by the current platform administrator. Registered validation may use the six-digit business code; public self-registration remains disabled.
3. The viewer session continues normally whether or not the viewer signs in, and fullscreen remains user-controlled.
4. Visible, active playback sends rate-limited verification heartbeats with position and timing evidence. The advertiser consumes its configured credits per verified minute whenever its eligible ad is playing.
5. The host business earns its configured per-minute rate only when its earning toggle is enabled and the advertiser has enough spendable credit. Every movement is posted as an idempotent, balanced ledger transaction; wallets cannot be driven negative.
6. Business profiles are managed only by platform administrators and are never assigned to registered viewers.
7. Platform administrators monitor live audience, coarse viewer geography, channel uptime, playback validation, credit velocity, access failures, and application/database readiness from the Stream Monitor. Channel pause/resume/restart and viewer termination require a recorded reason and produce an audit event.

## Pilot product policy

| Rule | Default |
| --- | --- |
| Credit unit | 1 credit per verified minute |
| Host share | 100% during membership-first pilot |
| Completion threshold | At least 97% |
| Checkpoints | 25%, 50%, and 75% |
| Heartbeat | Every 45 seconds while playing |
| Offline earning | Up to 6 hours with a valid signed manifest |
| Media | Playable landscape MP4; duration is not limited to fixed presets |
| Self-display | Disabled by default |
| Cash redemption | Not available |
| Audience sensing | Not collected |

All rules are configurable and versioned. Historical settlements retain the policy version used at decision time.

## MVP success measures

- At least 99.5% crash-free player sessions on reference hardware
- At least 98% acceptance of technically completed plays
- Online status visible within 90 seconds
- New manifest visible within 5 minutes for online devices
- Local cached playback starts within 2 seconds
- No unbalanced ledger transaction
- No duplicate settlement under request retries
- Four consecutive stable pilot weeks before paid launch
