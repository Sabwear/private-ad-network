import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const configSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SECRET_KEY: z.string().min(20),
  MEDIA_WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(1000).max(60_000).default(5000),
  MEDIA_WORKER_ONCE: z.string().optional().transform((value) => value?.toLowerCase() === "true"),
  FFMPEG_PATH: z.string().min(1).default("ffmpeg"),
  FFPROBE_PATH: z.string().min(1).default("ffprobe"),
});

export type WorkerConfig = ReturnType<typeof loadConfig>;

export function loadConfig() {
  const parsed = configSchema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Media worker configuration is invalid: ${fields}`);
  }

  return {
    supabaseUrl: parsed.data.SUPABASE_URL,
    supabaseSecretKey: parsed.data.SUPABASE_SECRET_KEY,
    pollIntervalMs: parsed.data.MEDIA_WORKER_POLL_INTERVAL_MS,
    runOnce: parsed.data.MEDIA_WORKER_ONCE,
    ffmpegPath: parsed.data.FFMPEG_PATH,
    ffprobePath: parsed.data.FFPROBE_PATH,
    workerId: `${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`,
  };
}
