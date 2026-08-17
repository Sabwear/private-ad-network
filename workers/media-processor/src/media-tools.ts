import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

type CommandResult = { stdout: string; stderr: string };

const maxCapturedOutput = 256 * 1024;

export async function runCommand(command: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`${command} exceeded the 15 minute processing limit.`));
    }, 15 * 60 * 1000);
    timeout.unref();

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };

    child.stdout.on("data", (chunk: Buffer) => {
      if (stdout.length < maxCapturedOutput) stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < maxCapturedOutput) stderr += chunk.toString();
    });
    child.once("error", (error) => finish(() => reject(error)));
    child.once("close", (code) => {
      finish(() => {
        if (code === 0) resolve({ stdout, stderr });
        else reject(new Error(`${command} exited with code ${code}: ${stderr.slice(-4000)}`));
      });
    });
  });
}

export async function sha256File(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

export type MediaProbe = {
  durationMs: number;
  width: number;
  height: number;
  videoCodec: string;
  audioCodec: string | null;
  frameRate: string | null;
};

type ProbePayload = {
  streams?: Array<{
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
    avg_frame_rate?: string;
  }>;
  format?: { duration?: string };
};

export async function probeMedia(ffprobePath: string, inputPath: string): Promise<MediaProbe> {
  const { stdout } = await runCommand(ffprobePath, [
    "-v", "error",
    "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate",
    "-of", "json",
    inputPath,
  ]);
  const payload = JSON.parse(stdout) as ProbePayload;
  const video = payload.streams?.find((stream) => stream.codec_type === "video");
  const audio = payload.streams?.find((stream) => stream.codec_type === "audio");
  const durationMs = Math.round(Number(payload.format?.duration) * 1000);

  if (!video?.width || !video.height || !video.codec_name || !Number.isFinite(durationMs)) {
    throw new Error("FFprobe did not find a valid video stream.");
  }

  return {
    durationMs,
    width: video.width,
    height: video.height,
    videoCodec: video.codec_name,
    audioCodec: audio?.codec_name ?? null,
    frameRate: video.avg_frame_rate ?? null,
  };
}

export function validateProbe(probe: MediaProbe) {
  if (probe.durationMs < 1_000) throw new Error("Video must contain at least one second of playable content.");
  if (probe.width < 1280 || probe.height < 720 || Math.abs(probe.width / probe.height - 16 / 9) > 0.02) {
    throw new Error("Video must be landscape 16:9 at 1280 x 720 or higher.");
  }
}

export async function remuxMediaWithoutCompression(
  ffmpegPath: string,
  inputPath: string,
  normalizedPath: string,
  thumbnailPath: string,
) {
  await runCommand(ffmpegPath, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", inputPath,
    "-map", "0:v:0", "-map", "0:a:0?",
    "-c", "copy", "-movflags", "+faststart",
    normalizedPath,
  ]);
  await createThumbnail(ffmpegPath, normalizedPath, thumbnailPath);
}

async function createThumbnail(ffmpegPath: string, inputPath: string, thumbnailPath: string) {
  await runCommand(ffmpegPath, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-ss", "0", "-i", inputPath,
    "-frames:v", "1", "-vf", "scale=640:-2",
    "-q:v", "3",
    thumbnailPath,
  ]);
}

export async function normalizeMedia(
  ffmpegPath: string,
  inputPath: string,
  normalizedPath: string,
  thumbnailPath: string,
) {
  await runCommand(ffmpegPath, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", inputPath,
    "-map", "0:v:0", "-map", "0:a:0?",
    "-vf", "scale=min(1920\\,iw):-2,format=yuv420p",
    "-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "21",
    "-profile:v", "high", "-level", "4.1", "-g", "60", "-keyint_min", "60", "-sc_threshold", "0",
    "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
    "-movflags", "+faststart",
    normalizedPath,
  ]);

  await createThumbnail(ffmpegPath, normalizedPath, thumbnailPath);
}

export type HlsRendition = {
  name: string;
  width: number;
  height: number;
  bandwidth: number;
  playlist: string;
};

export async function generateAdaptiveHls(
  ffmpegPath: string,
  inputPath: string,
  outputDirectory: string,
): Promise<HlsRendition[]> {
  const renditions: HlsRendition[] = [
    { name: "720p", width: 1280, height: 720, bandwidth: 3_200_000, playlist: "720p/index.m3u8" },
    { name: "480p", width: 854, height: 480, bandwidth: 1_400_000, playlist: "480p/index.m3u8" },
  ];

  for (const rendition of renditions) {
    const renditionDirectory = join(outputDirectory, rendition.name);
    await mkdir(renditionDirectory, { recursive: true });
    await runCommand(ffmpegPath, [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", inputPath,
      "-map", "0:v:0", "-map", "0:a:0?",
      "-vf", `scale=-2:${rendition.height},format=yuv420p`,
      "-r", "30", "-c:v", "libx264", "-preset", "medium",
      "-b:v", rendition.name === "720p" ? "2800k" : "1100k",
      "-maxrate", rendition.name === "720p" ? "3200k" : "1400k",
      "-bufsize", rendition.name === "720p" ? "5600k" : "2200k",
      "-g", "120", "-keyint_min", "120", "-sc_threshold", "0",
      "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
      "-f", "hls", "-hls_time", "4", "-hls_playlist_type", "vod",
      "-hls_flags", "independent_segments",
      "-hls_segment_filename", join(renditionDirectory, "segment_%05d.ts"),
      join(renditionDirectory, "index.m3u8"),
    ]);
  }

  const master = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    ...renditions.flatMap((rendition) => [
      `#EXT-X-STREAM-INF:BANDWIDTH=${rendition.bandwidth},RESOLUTION=${rendition.width}x${rendition.height}`,
      rendition.playlist,
    ]),
    "",
  ].join("\n");
  await writeFile(join(outputDirectory, "master.m3u8"), master, "utf8");
  return renditions;
}

export async function verifyMediaTools(ffmpegPath: string, ffprobePath: string) {
  await Promise.all([
    runCommand(ffmpegPath, ["-version"]),
    runCommand(ffprobePath, ["-version"]),
  ]);
}
