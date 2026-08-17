# Domain and Data Model

## Identity and tenancy

### organizations

`id`, `public_id`, `display_name`, `legal_name`, `category`, `status`, website/contact details, logo storage path, logo position, logo size percentage, unique six-digit stream access code, stream earning toggle, earning rate per verified minute, ad consumption rate per verified minute, billing profile, accepted policy version, timestamps

### users

`id`, `email`, authentication state, MFA state, timestamps

### memberships

`user_id`, `organization_id`, `role`, status, invitation metadata

### locations

`id`, `organization_id`, address/zone, category, operating hours, traffic band, blocked advertising categories, quality score, compliance state

## Devices

### devices

`id`, `location_id`, activation state, public-key fingerprint, app version, capabilities, last heartbeat, current manifest, risk state, suspension reason

### device_activation_codes

Private table containing the hashed short-lived code, hashed provisional credential, device public key, requester network context, expiry, claim state, and claimed device. Raw codes and credentials are never stored.

### device_credentials

Private table containing a per-device credential hash, issue/use/revocation timestamps, and credential state. Device suspension immediately revokes active credentials.

### device_observations

Tenant-scoped operational observations recorded at heartbeat time: server-derived IP address and network edge, user agent, detected device/browser/OS type, locale, timezone, display capabilities, connection hints, app version, and observation timestamp. This data is for security, support, and playback reliability; it does not contain audience identity, camera, or microphone data.

### device_commands

Command type, parameters, issued/acknowledged/completed timestamps, result

## Media and campaigns

### media_assets

Owner, source type (`upload` or `youtube`), external provider/ID/URL when applicable, original/normalized/thumbnail storage keys, original filename, MIME type, file size, duration, dimensions, codec, SHA-256 checksum, technical metadata, moderation state, rights declaration, rejection reason, submit/moderate timestamps, moderator, and creator.

Uploaded objects use `<organization-public-id>/<asset-public-id>/original.mp4`. The bucket is private; tenant members and platform administrators receive only short-lived authorized preview URLs. YouTube rows store a canonical video ID and source URL rather than copying third-party bytes. Business users cannot directly set approval state for either source.

### campaigns

Owner, asset, status, dates, total/daily credit budget, targeting JSON, frequency cap, policy version

### streaming_channels

Public ID, independent bearer access key, name, description, availability status, `broadcast_enabled`, `broadcast_started_at`, and presentation settings for the live badge, channel title, now-playing text, audio control, advertiser logos, stripe banner/text/position, video time, and contain/cover scaling. The broadcast timestamp anchors the shared loop; enabling broadcast or changing the ordered playlist resets it.

### streaming_channel_organizations

Channel-to-business assignment. Assigned organizations can discover and consume only their permitted channel through tenant-aware policies.

### streaming_channel_items

Channel, approved/ready media asset, deterministic position, status, and creator. The database requires uploads to have a normalized object and YouTube sources to have constrained provider metadata before either source can be assigned.

Business ad assignment reuses this ordered channel-item model; ownership is validated before an administrator can add or remove the asset.

### stream_viewer_sessions

Server-only viewer sessions created after a valid channel bearer link and assigned business code. A viewer can remain anonymous or identify through an authenticated, email-verified account that the current platform administrator approved. Registered sessions retain a name/email snapshot for 90 days, then purge personal data while preserving anonymous accounting history. Sessions store only a token hash, expire after 12 hours, support explicit termination, and track verified activity and playback evidence. Coarse country, region, city, and edge-colocation metadata may be retained during the operations window and is removed by the same privacy purge; raw viewer IP addresses are never stored.

### stream_credit_events

Idempotent web-stream heartbeats linked to a viewer session and active channel asset. Each event records capped verified seconds, playback position, validation evidence, rejection reasons, and the business-specific earning and consumption amounts posted to the balanced ledger. Advertiser wallets are locked in deterministic order and charged promotional, earned, then purchased credits; unfunded playback never creates earnings or a negative balance.

### stream_access_attempts

Server-only, hashed-network attempt records used to rate-limit six-digit code validation without retaining raw IP addresses.

### stream_access_code_rotations

Audit history for business access-code rotation. Previous codes are retained only as SHA-256 hashes. Rotation expires all open viewer sessions and assigns a new 180-day code lifetime.

### campaign_holds

Campaign, wallet source, reserved/consumed/released amounts, expiry, status

### playlist_manifests

Device, version, valid-from/until, policy version, ordered assignment snapshot, signature, superseded timestamp

### manifest_assignments

Manifest, campaign, asset, nonce, order/weight, expected duration, storage checksum

## Evidence

### playback_sessions

Unique playback ID, device, manifest assignment, campaign, asset, server nonce, start/completion, verified seconds, decision, confidence score, settlement transaction

### playback_events

Session, unique device sequence, event ID, type, position, device time, server receipt, monotonic time, foreground/display/network state, previous-event hash, signature validation

### fraud_cases

Session/device, score, reason codes, evidence snapshot, reviewer, outcome, resolution timestamp

## Credits

### wallets

Organization/system owner, wallet type (`PURCHASED`, `EARNED`, `PROMOTIONAL`, `HELD`, `PLATFORM`), balance projection

### ledger_transactions

Type, reference, policy version, unique idempotency key, status, actor, reversal-of transaction, timestamps

### ledger_entries

Transaction, wallet, signed amount, description, expiry metadata

### payments

Organization, provider reference, cash amount/currency, purchased credits, invoice, status

## Operations

### policy_versions

Immutable JSON policy document, effective time, approver, superseded time

### audit_logs

Actor, action, object type/ID, before/after summary, reason, request/IP/device context, timestamp

## Required constraints

- Unique settlement idempotency key
- Unique `(device_id, sequence)` event pair
- Unique playback ID
- Unique manifest assignment nonce per device validity window
- Sum of ledger entries for every committed transaction equals zero under the defined accounting representation
- Settled ledger entries are never updated or deleted
- Reversals reference the original transaction
- Campaign spend plus active holds cannot exceed spendable balance
- UTC timestamps in storage; local time only at presentation
- Policy version on manifests, campaigns, decisions, and settlements
- Organization ownership enforced at repository/query level and backed by authorization tests

## Balance projections

Wallet projections exist for efficient reads but are never an editable source of truth. Reconciliation recomputes them from committed ledger entries and alerts on any mismatch.
