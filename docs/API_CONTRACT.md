# API Contract

Implemented web-player endpoints use base path `/api/v1`. Future native-player endpoints may move behind a dedicated `/v1` gateway. Portal actions require an authenticated user and organization role.

## Device activation and health

### `POST /api/v1/devices/activation/request`

Creates a 10-minute pairing session from a device-generated public key and operational capabilities. Returns the pairing code and provisional credential once. The server stores only their SHA-256 hashes and derives the requester IP from trusted request headers.

### `POST /api/v1/devices/activation/status`

Polls the activation state using the activation ID and provisional credential. A successful claim returns the assigned public device ID and heartbeat interval.

### Portal action: claim pairing code

An authenticated platform administrator or authorized organization operator assigns the code to an active location. The operation creates the device, binds its public key, activates its credential, and writes an audit record atomically.

### `POST /v1/devices/token/refresh`

Rotates the device access token. Refresh credentials are revocable per device.

### `GET /v1/devices/{deviceId}/manifest`

Returns the latest signed manifest or `304 Not Modified`. Includes validity, policy, ordered assignments, hashes, nonces, fallback asset, and minimum app version.

### `POST /api/v1/devices/heartbeat`

Authenticates with the per-device bearer credential and reports app, runtime, display, locale, timezone, and network capabilities. The server records the observed IP, country, and edge separately so a client cannot self-assert them.

## Playback

### Channel streaming

- `GET /stream/{channelId}/{accessKey}` opens the continuous channel viewer. The access key is a bearer credential and should only be shared with assigned business devices.
- `GET /api/v1/channels/{channelId}/hls/{assetId}/{resource}?key=...` authorizes an HLS playlist or redirects an authorized segment to short-lived private storage.
- `GET /api/v1/channels/{channelId}/media/{assetId}?key=...` provides the normalized MP4 fallback for previously processed media or browsers without HLS support.
- Every asset request verifies that the channel is active and the approved asset is currently in that channel.
- The viewer response composes channel presentation settings and the current advertiser's public logo metadata. A logged-in platform administrator additionally receives the in-player settings control; bearer-link viewers do not.

### `POST /v1/playback/sessions`

Opens a playback using `device_id`, `manifest_id`, assignment ID, nonce, asset checksum, and unique playback ID.

### `POST /v1/playback/events/batch`

Accepts an ordered, signed array of lifecycle/start/checkpoint/completion/error events. Response returns per-event acceptance plus session decision/settlement state.

Required event fields:

```json
{
  "event_id": "evt_...",
  "playback_id": "play_...",
  "device_id": "dev_...",
  "manifest_id": "man_...",
  "campaign_id": "cmp_...",
  "asset_id": "ast_...",
  "type": "CHECKPOINT",
  "sequence": 18422,
  "position_ms": 15000,
  "device_time": "2026-08-09T11:42:18Z",
  "monotonic_ms": 88400213,
  "app_foreground": true,
  "display_state": "ON",
  "network_state": "CONNECTED",
  "previous_event_hash": "sha256:...",
  "signature": "base64:..."
}
```

## Portal

- Media preparation is currently an authenticated server action that creates a draft asset and returns its tenant-scoped storage path.
- The browser uploads the MP4 directly to private object storage, avoiding application-server request-size, memory, and timeout limits on every supported host.
- Media submission is a second authenticated action that verifies the object exists, records browser preflight metadata and checksum, accepts the rights declaration, and moves the asset to `in_review`.
- Platform moderation records `approved` or `rejected`, requires a reason, and writes an audit record. Direct client updates to moderation state are denied.
- `GET /api/v1/media/{assetId}/playback` authenticates the portal user, relies on tenant RLS for asset authorization, and redirects to a five-minute signed private-storage URL. The application server never proxies video bytes, so storage/CDN range delivery remains available without tying playback to the web host.
- `POST /v1/campaigns`
- `POST /v1/campaigns/{id}/pause`
- `POST /v1/campaigns/{id}/resume`
- `GET /v1/wallets/{id}/statement`
- `GET /v1/reports/delivery`
- `POST /v1/disputes`

## Administration

- The `/channels` workspace creates and deletes streams, assigns businesses, copies viewer links, manages ordered approved media, and configures all stream information layers.
- The `/business` workspace edits business identity/contact data, manages the public presentation logo, configures its overlay placement, and assigns approved business ads to channels.

- `POST /v1/admin/media/{id}/decision`
- `POST /v1/admin/playbacks/{id}/review`
- `POST /v1/admin/ledger/adjustments`
- `POST /v1/admin/devices/{id}/suspend`
- `POST /v1/admin/devices/{id}/commands`
- `POST /v1/admin/policies`

## Error envelope

```json
{
  "error": {
    "code": "PLAYBACK_DUPLICATE",
    "message": "This event batch was already processed.",
    "request_id": "req_...",
    "details": {}
  }
}
```

Codes are stable and machine-readable. Messages are safe for logs/UI. Security-sensitive detail stays in protected diagnostics.

## Retry behavior

- Every mutating device request requires `Idempotency-Key`.
- A retry returns the original status and response body after a successful commit.
- `409` means a key was reused with a different request body.
- Batches may contain previously accepted events; duplicates are acknowledged without reprocessing.
- Server receipt time is authoritative for validity windows; monotonic device time supports duration checks.

Generate OpenAPI and typed TypeScript/Kotlin clients from one source contract before implementing the Android integration.
