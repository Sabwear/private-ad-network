# Security and Trust Model

## Assets to protect

- Organization accounts and roles
- Device identity and signing keys
- Approved media and signed manifests
- Playback evidence and decision history
- Credit holds, ledger entries, purchases, and invoices
- Policy versions and administrative audit logs

## Trust boundaries

The TV device and venue network are untrusted environments. A device event is evidence, not truth, until server validation. Portal users are authenticated but still limited by organization scope and role. Privileged administrative actions require explicit reason and audit.

## Device controls

- Per-device asymmetric key in Android Keystore
- Short-lived access token and independently revocable refresh credential
- Signed manifest covering assignments, validity, policy, hashes, and nonces
- Signed event batches with monotonic sequence and previous-event hash
- Play Integrity where supported; signed builds and behavioral checks elsewhere
- Minimum app version, credential rotation, and remote suspension
- Device-owner/lock-task mode on managed pilot hardware where possible

## Evidence validation

Positive signals include valid signature/integrity, recent heartbeat, correct hash, normal timing, stable sequence, foreground app, active display, and permitted operating hours.

Negative signals include replayed IDs/nonces, impossible playback speed, screen-off state, clock drift, repeated offline batches, hash-chain breaks, unusual restart patterns, and integrity failure.

Outcomes:

- Accept: policy requirements pass and fraud score is below review threshold.
- Hold: evidence is plausible but one or more signals need review.
- Reject: required proof is absent/invalid or tampering/replay is established.

No single weak hardware signal should automatically accuse a venue of fraud. Store reason codes and confidence.

## Portal controls

- Strong password/session security and admin MFA
- Role-based access with organization tenancy enforcement
- Separate platform-administrator authority that is not stored in user-editable authentication metadata
- Administrator-only organization creation with atomic owner assignment and wallet initialization
- Verified but unassigned accounts remain outside the workspace
- Separation of content, operations, and finance duties
- Reauthentication for sensitive policy, adjustment, or credential actions
- CSRF-safe mutations, validation, encoding, secure cookies, and rate limits
- Short-lived, type/size-restricted direct upload URLs
- Malware and media validation before moderation

## Ledger controls

- Double-entry transaction model
- Unique idempotency for settlement, purchases, and adjustments
- No updates/deletes of settled entries
- Reversals link to original transactions
- Adjustment reason, evidence, actor, and approval path
- Automated reconciliation and alert on projection mismatch
- Purchased, earned, promotional, held, and platform credits remain distinguishable

## Privacy

- Collect operational device telemetry, not audience identities
- No cameras, microphones, facial recognition, or demographic inference in MVP
- Use registered venue/zone rather than continuous personal geolocation
- Limit raw evidence retention to settlement, fraud, and dispute needs
- Aggregate or delete expired detailed telemetry under a documented policy
- Provide a clear device data notice to participating businesses

## Minimum incident playbooks

- Compromised user account
- Compromised or cloned device
- Prohibited media takedown
- Ledger discrepancy or duplicate settlement
- Platform outage and cached playback reconciliation
- Object storage exposure
- Database restore and credential rotation

## Pre-pilot security gate

- Threat model reviewed
- Admin MFA enforced
- Authorization integration tests pass
- Secrets externalized and rotated
- Dependency and container scans pass
- Backup restore tested
- Device revocation tested
- Abuse/rate limits load-tested
- Audit records cover all privileged actions
