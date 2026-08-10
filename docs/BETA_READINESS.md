# Limited Beta Readiness

## Supported beta scope

The limited beta validates the central platform's operational path:

1. An administrator invites and manages approved users.
2. The administrator creates businesses; owners manage their assigned business and locations.
3. A screen is paired, sends heartbeats, and exposes operational device diagnostics.
4. Media is uploaded privately, reviewed, processed, and converted to adaptive HLS.
5. An administrator creates a channel, assigns businesses, adds approved media, and opens the protected viewer link.
6. A business owner or team member can create a campaign draft with approved media, target businesses, dates, budget, and frequency limits.

The Overview page reports live repository data. Empty states are genuine and no finance or proof values are simulated in a deployed environment.

## Required launch checklist

- [ ] Production `/api/health` returns `200` and `/api/ready` returns `200`.
- [ ] A media-processor container is running continuously with protected server credentials.
- [ ] At least one approved test business, location, owner, and screen are configured.
- [ ] At least one test video reaches `ready`, is added to a channel, and plays in both adaptive and fallback modes.
- [ ] Every tester is invited by the administrator; public signup remains disabled.
- [ ] Authentication Site URL, callback URLs, and custom SMTP are configured for the production hostname.
- [ ] Leaked-password protection is enabled and administrator MFA is enforced before external testers are invited.
- [ ] Database backup and restore instructions have been exercised once.
- [ ] A tester privacy notice explains IP, device, browser, operating-system, and activity telemetry.
- [ ] `pnpm test:beta` passes and the GitHub Application validation workflow is green.
- [ ] Complete the supported flow with the marked demo dataset, then clear it from Admin control and confirm real client records remain untouched.

## Explicitly outside this beta

These screens are visible only as roadmap boundaries and do not claim production behavior:

- Campaign activation, delivery scheduling, and delivery decisions; draft planning is available
- Native Android TV application, offline media cache, and signed device manifests
- Playback proof settlement, fraud scoring, and evidence review
- Wallets, credits, billing, payouts, and financial ledger
- Reports and exports

Do not use the beta for money movement, paid advertising commitments, or unattended public-display rollouts.

## Beta exit criteria

- Five invited users complete the supported flow without cross-business data exposure.
- Three reference screens remain connected for 72 hours with recoverable media playback.
- Revoking a user, device, and channel link takes effect as expected.
- No critical/high security defects remain open.
- The team can detect an outage through readiness monitoring and restore the database from backup.
- Campaign delivery, device-native playback, proof, and ledger phases have their own acceptance tests before the scope expands.
