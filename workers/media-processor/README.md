# Loopline media processor

This service processes private advertising videos independently from the web host.

## Responsibilities

- Atomically claim durable processing jobs
- Download the private original through a short-lived server-authorized URL
- Verify the submitted SHA-256 checksum
- Inspect the source with FFprobe and reject invalid duration, dimensions, or aspect ratio
- Normalize to H.264/AAC MP4 with fast-start metadata for progressive playback
- Generate a JPEG thumbnail
- Upload versioned derivatives and publish technical metadata
- Retry temporary failures with exponential delay and recover stale worker leases

## Local commands

Copy `.env.example` to `.env`, install FFmpeg/FFprobe, then run:

```bash
pnpm worker:media:check
pnpm worker:media:build
pnpm worker:media:dev
```

Set `MEDIA_WORKER_ONCE=true` to claim at most one job, which is useful for scheduled or diagnostic runs.

## Container deployment

From the repository root:

```bash
docker build -f workers/media-processor/Dockerfile -t loopline-media-processor .
docker run --env-file workers/media-processor/.env loopline-media-processor
```

Run one replica for the pilot. Additional replicas are safe because job claiming uses row locks with `SKIP LOCKED`.
