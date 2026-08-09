# Domain and Data Model

## Identity and tenancy

### organizations

`id`, `display_name`, `legal_name`, `category`, `status`, `billing_profile`, `accepted_policy_version`, timestamps

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

Owner, original storage key, normalized storage key, duration, dimensions, codec, checksum, moderation state, rights declaration, rejection reason, thumbnail

### campaigns

Owner, asset, status, dates, total/daily credit budget, targeting JSON, frequency cap, policy version

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
