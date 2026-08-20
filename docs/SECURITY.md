# Security and Trust Model

## Assets to protect

- Administrator and approved-viewer accounts
- Device identity and signing keys
- Approved media and signed manifests
- Playback evidence and decision history
- Credit holds, ledger entries, purchases, and invoices
- Policy versions and administrative audit logs

## Trust boundaries

The TV device and venue network are untrusted environments. A device event is evidence, not truth, until server validation. Only active administrators enter the portal; approved viewers authenticate only when they choose registered stream identity. Privileged administrative actions require explicit reason and audit.

## Device controls

- Ten-minute, single-use pairing codes are stored only as hashes
- Device credentials are generated with cryptographic randomness, stored only as hashes, and revoked on suspension
- The web-player simulator creates a P-256 key pair and stores the private key as a non-extractable browser credential
- Pairing claims require an active location and an authorized platform administrator
- Heartbeats accept only active device credentials; the server derives IP/country/edge context from the request
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
- Administrator-only dashboard access enforced at the layout, action, repository, database-function, and RLS boundaries
- Separate platform-administrator authority that is not stored in user-editable authentication metadata
- Administrator-only business creation with atomic wallet initialization and no user assignment
- Invitation-only account creation controlled by the platform administrator
- Viewer accounts remain outside the dashboard and can identify only registered stream sessions
- Administrator-controlled viewer suspension; administrator account access is protected from the ordinary user editor
- Portal sessions record server-observed IP, device/browser/OS, edge location, route, and recent activity
- Suspended accounts and revoked observed sessions are rejected at the portal boundary; administrator RLS also requires an active admin profile
- Separation of content, operations, and finance duties
- Reauthentication for sensitive policy, adjustment, or credential actions
- CSRF-safe mutations, validation, encoding, secure cookies, and rate limits
- Short-lived, type/size-restricted direct upload URLs
- Malware and media validation before direct administrator approval
- Private media objects are scoped to an existing business asset and served to administrators or authorized players through short-lived URLs
- Business logos are intentionally public presentation assets, but upload, replacement, deletion, and organization association require platform-administrator authorization
- Public stream viewers receive only the resolved logo URL and display settings; channel-setting mutations exist only in the administrator-protected Operations workflow and the player exposes no mutation control
- Anonymous web streams require only the valid channel bearer URL. Registered identity may additionally validate the non-expired, rate-limited six-digit business code; rotating the code terminates affected identified sessions
- Network identifiers used for stream rate limiting are HMAC-peppered with a server-only secret; raw IP addresses are never stored
- Anonymous viewers never provide identity. Identified viewers must use an active, email-verified account created or approved by the current platform administrator
- Stream cookies are HTTP-only, SameSite strict, time-limited, stored only as token hashes, and independently terminable from the player
- Playback heartbeats are idempotent and validate server timing, client clock, foreground visibility, playing state, asset membership, and playback position before credit movement
- Stream operations telemetry and handling controls are restricted to the active platform administrator role; operational mutations require a reason and write an audit record
- Detailed playback evidence is selectable by authenticated users only through an active platform-administrator RLS policy; viewer accounts cannot query wallet spend evidence or execute the administrator wallet report
- Pilot uploads accept MP4 only, enforce a 100 MB bucket limit, compute a browser SHA-256 checksum, and require valid playable media; fixed 15/30/60-second duration limits are removed
- External media accepts only recognized HTTPS YouTube URL shapes, stores the canonical video ID, uses the privacy-enhanced embed domain, and never permits arbitrary iframe origins
- Both uploaded and YouTube media require a business selection, rights declaration, and administrator validation before channel assignment
- Administrator submissions approve directly; no business role or redundant review queue exists
- Browser preflight is backed by the server-side FFmpeg media processor; malware scanning remains required before the scope expands beyond controlled beta media

## Ledger controls

- Double-entry transaction model
- Unique idempotency for settlement, purchases, and adjustments
- No updates/deletes of settled entries
- Reversals link to original transactions
- Adjustment reason, evidence, actor, and approval path
- Automated reconciliation and alert on projection mismatch
- Purchased, earned, promotional, held, and platform credits remain distinguishable
- Administrator promotional grants require an active administrator, a bounded positive amount, and a reason; each grant posts balanced business/platform entries and an audit record
- Stream consumption locks wallets in consistent ID order and debits promotional, then earned, then purchased credit without allowing a negative balance
- Busy-hour configuration is administrator-only, audited, RLS-protected, overlap-validated, and bounded to a 10× maximum; settlement records the applied multiplier as evidence
- Host earnings are not created when an advertiser lacks spendable credit; only that advertiser's ads are excluded when building a fresh stream playlist and recorded as insufficient-credit evidence under settlement races, while the channel and other campaigns remain active

## Privacy

- Anonymous viewing collects operational session evidence without audience identity
- Registered viewing stores the administrator-approved account ID plus a name/email snapshot for business reporting after explicit viewer choice
- Operational telemetry currently includes server-observed IP, device/browser/OS type, locale, timezone, screen capabilities, connection hints, app version, and heartbeat time
- Portal security telemetry includes user session ID, server-observed IP, user agent, coarse edge location, last route, and activity timestamps
- Exact IP observations are visible only to platform administrators under RLS
- No cameras, microphones, facial recognition, or demographic inference in MVP
- Use registered venue/zone rather than continuous personal geolocation
- Limit raw evidence retention to settlement, fraud, and dispute needs
- Aggregate or delete expired detailed telemetry under a documented policy
- Registered stream identity, hashed network context, and user agent are purged after 90 days; accounting history remains anonymous and access-attempt records are removed after 24 hours
- Provide a clear device data notice to participating businesses
- Define and automate a raw IP/device-observation retention window before the external pilot; the recommended starting point is 30 days unless legal or incident requirements demand less or more

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
- Admin MFA enforced before external beta invitations
- Authorization integration tests pass
- Secrets externalized and rotated
- Dependency and container scans pass
- Backup restore tested
- Device revocation tested
- Abuse/rate limits load-tested
- Audit records cover all privileged actions
