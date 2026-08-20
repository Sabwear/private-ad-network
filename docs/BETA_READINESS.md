# Limited Beta Readiness

## Supported beta scope

The limited beta validates the central platform's operational path:

1. An administrator invites and manages approved users.
2. The administrator centrally creates and manages every business and location.
3. A screen is paired, sends heartbeats, and exposes operational device diagnostics.
4. Media is uploaded privately with progress and optional compression, approves directly after administrator validation, and is converted to adaptive HLS.
5. An administrator creates a channel, assigns businesses, adds approved media, and opens the protected viewer link.
6. An administrator can responsively create, target, and publish a campaign with approved media, locations, dates, budget, and frequency limits.
7. An administrator edits business details, uploads its logo, assigns its approved ads to channels, and controls every channel's video presentation from Operations.
8. Dashboard search, Guide, notifications, and Live Beta shortcut provide working navigation rather than decorative controls.

The Overview page reports live repository data. Empty states are genuine and no finance or proof values are simulated in a deployed environment.

## Required launch checklist

- [x] Production `/api/health` returns `200` and schema-aware `/api/ready` returns `200` (verified 2026-08-20).
- [ ] A media-processor container is running continuously with protected server credentials.
- [ ] At least one approved test business, location, administrator, and screen are configured.
- [ ] At least one test video reaches `ready`, is added to a channel, and plays in both adaptive and fallback modes.
- [ ] Every tester is invited by the administrator; public signup remains disabled.
- [ ] Authentication Site URL, callback URLs, and custom SMTP are configured for the production hostname.
- [ ] Leaked-password protection is enabled and administrator MFA is enforced before external testers are invited.
- [ ] Database backup and restore instructions have been exercised once.
- [ ] A tester privacy notice explains IP, device, browser, operating-system, and activity telemetry.
- [ ] `pnpm test:beta` passes and the GitHub Application validation workflow is green.
- [ ] Complete the supported flow with the marked demo dataset, then clear it from Admin control and confirm real client records remain untouched.
- [ ] Upload at least one real transparent business logo and verify all four positions and representative sizes on desktop and display hardware.
- [ ] Verify every channel video setting from Operations and confirm the public player contains no settings mutation menu for any viewer.

## Explicitly outside this beta

These screens are visible only as roadmap boundaries and do not claim production behavior:

- Deterministic device delivery scheduling and delivery decisions; administrator campaign publishing is available
- Native Android TV application, offline media cache, and signed device manifests
- Playback proof settlement, fraud scoring, and evidence review
- Wallets, credits, billing, payouts, and financial ledger
- Reports and exports

Do not use the beta for money movement, paid advertising commitments, or unattended public-display rollouts.

## Next-phase entry gate

The next phase is reference-device playback and signed manifests. Begin only after the web beta checklist above is green, a media worker is continuously deployed, one reference Android TV device is selected, and the privacy/backup requirements have named owners.

## Beta exit criteria

- Administrators complete the supported flow while viewer accounts remain excluded from all dashboard data.
- Three reference screens remain connected for 72 hours with recoverable media playback.
- Revoking a user, device, and channel link takes effect as expected.
- No critical/high security defects remain open.
- The team can detect an outage through readiness monitoring and restore the database from backup.
- Campaign delivery, device-native playback, proof, and ledger phases have their own acceptance tests before the scope expands.
