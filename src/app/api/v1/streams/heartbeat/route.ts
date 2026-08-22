import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashViewerToken, viewerTokenFromRequest } from "@/lib/streaming/viewer-session";

const heartbeatSchema = z.object({
  mediaId: z.string().uuid(),
  eventKey: z.string().uuid(),
  positionSeconds: z.number().finite().min(0).max(86_400),
  clientEventAt: z.string().datetime(),
  pageVisible: z.boolean(),
  isPlaying: z.boolean(),
  quality: z.object({
    playbackType: z.enum(["upload", "youtube"]),
    observedIntervalMs: z.number().int().min(0).max(60_000),
    startupMs: z.number().int().min(0).max(120_000).nullable().optional(),
    bufferCount: z.number().int().min(0).max(1_000),
    bufferDurationMs: z.number().int().min(0).max(60_000),
    heartbeatRttMs: z.number().int().min(0).max(120_000).nullable().optional(),
    connectionRttMs: z.number().int().min(0).max(120_000).nullable().optional(),
    downlinkMbps: z.number().finite().min(0).max(100_000).nullable().optional(),
    effectiveConnectionType: z.enum(["slow-2g", "2g", "3g", "4g"]).nullable().optional(),
    droppedFrames: z.number().int().min(0).max(2_147_483_647).nullable().optional(),
    totalFrames: z.number().int().min(0).max(2_147_483_647).nullable().optional(),
  }).optional(),
});

export async function POST(request: Request) {
  const parsed = heartbeatSchema.safeParse(await request.json().catch(() => null));
  const token = viewerTokenFromRequest(request);
  if (!parsed.success || !token) return NextResponse.json({ error: "Viewer session unavailable" }, { status: 401 });

  const admin = createAdminClient();
  const { data: session } = await admin
    .from("stream_viewer_sessions")
    .select("id,channel_id")
    .eq("token_hash", hashViewerToken(token))
    .is("ended_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!session) return NextResponse.json({ error: "Viewer session expired" }, { status: 401 });

  const { data, error } = await admin.rpc("record_stream_viewer_heartbeat_v2", {
    p_session_id: session.id,
    p_media_public_id: parsed.data.mediaId,
    p_event_key: parsed.data.eventKey,
    p_playback_position_seconds: parsed.data.positionSeconds,
    p_client_event_at: parsed.data.clientEventAt,
    p_page_visible: parsed.data.pageVisible,
    p_is_playing: parsed.data.isPlaying,
  });
  if (error) return NextResponse.json({ error: "Playback activity was not recorded" }, { status: 400 });

  const quality = parsed.data.quality;
  if (quality) {
    const { error: qualityError } = await admin.from("stream_quality_events").upsert({
      event_key: parsed.data.eventKey,
      viewer_session_id: session.id,
      channel_id: session.channel_id,
      media_public_id: parsed.data.mediaId,
      playback_type: quality.playbackType,
      observed_interval_ms: quality.observedIntervalMs,
      startup_ms: quality.startupMs ?? null,
      buffer_count: quality.bufferCount,
      buffer_duration_ms: quality.bufferDurationMs,
      heartbeat_rtt_ms: quality.heartbeatRttMs ?? null,
      connection_rtt_ms: quality.connectionRttMs ?? null,
      downlink_mbps: quality.downlinkMbps ?? null,
      effective_connection_type: quality.effectiveConnectionType ?? null,
      dropped_frames: quality.droppedFrames ?? null,
      total_frames: quality.totalFrames ?? null,
    }, { onConflict: "event_key", ignoreDuplicates: true });
    if (qualityError) console.error("Stream quality observation was not recorded", { code: qualityError.code });
  }

  return NextResponse.json({ ok: true, credit: data?.[0] ?? null }, { headers: { "Cache-Control": "private, no-store" } });
}
