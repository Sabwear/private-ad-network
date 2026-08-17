import assert from "node:assert/strict";
import test from "node:test";
import { validateProbe, type MediaProbe } from "./media-tools.js";

const validProbe: MediaProbe = {
  durationMs: 30_000,
  width: 1920,
  height: 1080,
  videoCodec: "h264",
  audioCodec: "aac",
  frameRate: "30/1",
};

test("accepts supported ad-video duration and dimensions", () => {
  assert.doesNotThrow(() => validateProbe(validProbe));
  assert.doesNotThrow(() => validateProbe({ ...validProbe, durationMs: 14_000, width: 1280, height: 720 }));
});

test("rejects unsupported ad-video duration", () => {
  assert.throws(() => validateProbe({ ...validProbe, durationMs: 20_000 }), /15, 30, or 60 seconds/);
});

test("rejects undersized and non-16:9 ad video", () => {
  assert.throws(() => validateProbe({ ...validProbe, width: 640, height: 360 }), /1280 x 720/);
  assert.throws(() => validateProbe({ ...validProbe, width: 1280, height: 800 }), /landscape 16:9/);
});
