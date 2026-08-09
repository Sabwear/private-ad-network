import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { WorkerConfig } from "./config.js";
import { logger } from "./logger.js";
import { generateAdaptiveHls, normalizeMedia, probeMedia, sha256File, validateProbe } from "./media-tools.js";

const mediaBucket = "media";

const claimedJobSchema = z.object({
  job_public_id: z.string().uuid(),
  asset_public_id: z.string().uuid(),
  organization_public_id: z.string().uuid(),
  original_storage_path: z.string().min(3),
  source_checksum_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  expected_duration_ms: z.number().int().nullable(),
  expected_width: z.number().int().nullable(),
  expected_height: z.number().int().nullable(),
  attempt: z.number().int().positive(),
});

export type ClaimedJob = z.infer<typeof claimedJobSchema>;

function storagePaths(job: ClaimedJob) {
  const assetDirectory = dirname(job.original_storage_path).replaceAll("\\", "/");
  const versionDirectory = `${assetDirectory}/processed/${job.source_checksum_sha256}`;
  return {
    normalized: `${versionDirectory}/normalized.mp4`,
    thumbnail: `${versionDirectory}/thumbnail.jpg`,
    hlsDirectory: `${versionDirectory}/hls`,
    hlsMaster: `${versionDirectory}/hls/master.m3u8`,
  };
}

async function downloadOriginal(client: SupabaseClient, storagePath: string, destination: string) {
  const { data, error } = await client.storage.from(mediaBucket).createSignedUrl(storagePath, 15 * 60);
  if (error || !data?.signedUrl) throw new Error("Unable to authorize the original media download.");

  const response = await fetch(data.signedUrl, { signal: AbortSignal.timeout(10 * 60 * 1000) });
  if (!response.ok || !response.body) throw new Error(`Original media download failed with status ${response.status}.`);
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(destination));
}

async function uploadFile(
  client: SupabaseClient,
  storagePath: string,
  localPath: string,
  contentType: string,
) {
  const payload = await readFile(localPath);
  const { error } = await client.storage.from(mediaBucket).upload(storagePath, payload, {
    contentType,
    cacheControl: "31536000",
    upsert: true,
  });
  if (error) throw new Error(`Processed media upload failed: ${error.message}`);
}

async function uploadDirectory(
  client: SupabaseClient,
  storageDirectory: string,
  localDirectory: string,
) {
  const entries = await readdir(localDirectory, { withFileTypes: true });
  for (const entry of entries) {
    const localPath = join(localDirectory, entry.name);
    const storagePath = `${storageDirectory}/${entry.name}`;
    if (entry.isDirectory()) {
      await uploadDirectory(client, storagePath, localPath);
    } else {
      const contentType = entry.name.endsWith(".m3u8")
        ? "application/vnd.apple.mpegurl"
        : entry.name.endsWith(".ts") ? "video/mp2t" : "application/octet-stream";
      await uploadFile(client, storagePath, localPath, contentType);
    }
  }
}

export class MediaProcessor {
  private readonly client: SupabaseClient;

  constructor(private readonly config: WorkerConfig) {
    this.client = createClient(config.supabaseUrl, config.supabaseSecretKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }

  async claim(): Promise<ClaimedJob | null> {
    const { data, error } = await this.client.rpc("claim_media_processing_job", {
      p_worker_id: this.config.workerId,
    });
    if (error) throw new Error(`Unable to claim a processing job: ${error.message}`);
    const candidate = Array.isArray(data) ? data[0] : null;
    if (!candidate) return null;
    return claimedJobSchema.parse(candidate);
  }

  async process(job: ClaimedJob) {
    const workDirectory = await mkdtemp(join(tmpdir(), "loopline-media-"));
    const inputPath = join(workDirectory, basename(job.original_storage_path));
    const normalizedPath = join(workDirectory, "normalized.mp4");
    const thumbnailPath = join(workDirectory, "thumbnail.jpg");
    const hlsDirectory = join(workDirectory, "hls");

    try {
      logger.info("media_processing_started", { jobId: job.job_public_id, assetId: job.asset_public_id, attempt: job.attempt });
      await downloadOriginal(this.client, job.original_storage_path, inputPath);

      const checksum = await sha256File(inputPath);
      if (checksum !== job.source_checksum_sha256) throw new Error("Original media checksum does not match the submitted checksum.");

      const sourceProbe = await probeMedia(this.config.ffprobePath, inputPath);
      validateProbe(sourceProbe);
      if (job.expected_duration_ms && Math.abs(job.expected_duration_ms - sourceProbe.durationMs) > 1000) {
        throw new Error("Server inspection does not match the submitted video duration.");
      }
      if (job.expected_width && job.expected_height
          && (job.expected_width !== sourceProbe.width || job.expected_height !== sourceProbe.height)) {
        throw new Error("Server inspection does not match the submitted video dimensions.");
      }
      await normalizeMedia(this.config.ffmpegPath, inputPath, normalizedPath, thumbnailPath);
      const normalizedProbe = await probeMedia(this.config.ffprobePath, normalizedPath);
      validateProbe(normalizedProbe);
      const renditions = await generateAdaptiveHls(this.config.ffmpegPath, normalizedPath, hlsDirectory);

      const paths = storagePaths(job);
      await Promise.all([
        uploadFile(this.client, paths.normalized, normalizedPath, "video/mp4"),
        uploadFile(this.client, paths.thumbnail, thumbnailPath, "image/jpeg"),
        uploadDirectory(this.client, paths.hlsDirectory, hlsDirectory),
      ]);
      const normalizedStats = await stat(normalizedPath);

      const { error } = await this.client.rpc("complete_media_processing_job_v2", {
        p_job_public_id: job.job_public_id,
        p_worker_id: this.config.workerId,
        p_normalized_storage_path: paths.normalized,
        p_thumbnail_storage_path: paths.thumbnail,
        p_hls_master_storage_path: paths.hlsMaster,
        p_hls_renditions: renditions,
        p_normalized_file_size_bytes: normalizedStats.size,
        p_duration_ms: normalizedProbe.durationMs,
        p_width: normalizedProbe.width,
        p_height: normalizedProbe.height,
        p_codec: `${normalizedProbe.videoCodec}${normalizedProbe.audioCodec ? ` / ${normalizedProbe.audioCodec}` : ""}`,
        p_processing_metadata: {
          sourceProbe,
          normalizedProbe,
          pipelineVersion: "2",
          fastStart: true,
          adaptiveHls: true,
          checksumVerified: true,
        },
      });
      if (error) throw new Error(`Unable to complete the processing job: ${error.message}`);
      logger.info("media_processing_completed", { jobId: job.job_public_id, assetId: job.asset_public_id, bytes: normalizedStats.size });
    } finally {
      await rm(workDirectory, { recursive: true, force: true });
    }
  }

  async fail(job: ClaimedJob, cause: unknown) {
    const message = cause instanceof Error ? cause.message : "Unknown media processing failure.";
    const { data: willRetry, error } = await this.client.rpc("fail_media_processing_job", {
      p_job_public_id: job.job_public_id,
      p_worker_id: this.config.workerId,
      p_error: message.slice(0, 1000),
    });
    if (error) {
      logger.error("media_processing_failure_record_failed", { jobId: job.job_public_id, error: error.message });
      return;
    }
    logger.warn("media_processing_failed", { jobId: job.job_public_id, assetId: job.asset_public_id, willRetry: Boolean(willRetry), error: message.slice(0, 500) });
  }
}
