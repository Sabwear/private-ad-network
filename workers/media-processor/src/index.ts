import { setTimeout as delay } from "node:timers/promises";
import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { verifyMediaTools } from "./media-tools.js";
import { MediaProcessor } from "./processor.js";

let stopping = false;
process.once("SIGTERM", () => { stopping = true; });
process.once("SIGINT", () => { stopping = true; });

async function main() {
  const config = loadConfig();
  await verifyMediaTools(config.ffmpegPath, config.ffprobePath);
  const processor = new MediaProcessor(config);
  logger.info("media_worker_started", { workerId: config.workerId, pollIntervalMs: config.pollIntervalMs });

  do {
    let job = null;
    try {
      job = await processor.claim();
      if (job) await processor.process(job);
    } catch (error) {
      if (job) await processor.fail(job, error);
      else logger.error("media_worker_poll_failed", { error: error instanceof Error ? error.message : "Unknown worker failure." });
    }

    if (config.runOnce || stopping) break;
    if (!job) await delay(config.pollIntervalMs);
  } while (!stopping);

  logger.info("media_worker_stopped", { workerId: config.workerId });
}

main().catch((error) => {
  logger.error("media_worker_startup_failed", { error: error instanceof Error ? error.message : "Unknown startup failure." });
  process.exitCode = 1;
});
