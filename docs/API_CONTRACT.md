# API Contract

Base path: `/v1`. Device-facing mutations require an idempotency key and authenticated device identity. Portal actions require an authenticated user and organization role.

## Device activation and health

### `POST /v1/devices/activate`

Exchanges a short-lived pairing code, public key, app/device metadata, and capabilities for device identity and initial configuration.

### `POST /v1/devices/token/refresh`

Rotates the device access token. Refresh credentials are revocable per device.

### `GET /v1/devices/{deviceId}/manifest`

Returns the latest signed manifest or `304 Not Modified`. Includes validity, policy, ordered assignments, hashes, nonces, fallback asset, and minimum app version.

### `POST /v1/devices/{deviceId}/heartbeat`

Reports current asset, playback position, foreground/display state, app version, storage, network, and last event sequence.

## Playback

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

- `POST /v1/media/upload-url`
- `POST /v1/media/{id}/submit`
- `POST /v1/campaigns`
- `POST /v1/campaigns/{id}/pause`
- `POST /v1/campaigns/{id}/resume`
- `GET /v1/wallets/{id}/statement`
- `GET /v1/reports/delivery`
- `POST /v1/disputes`

## Administration

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
