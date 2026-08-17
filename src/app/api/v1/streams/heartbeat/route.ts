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
});

export async function POST(request: Request) {
  const parsed = heartbeatSchema.safeParse(await request.json().catch(() => null));
  const token = viewerTokenFromRequest(request);
  if (!parsed.success || !token) return NextResponse.json({ error: "Viewer session unavailable" }, { status: 401 });

  const admin = createAdminClient();
  const { data: session } = await admin
    .from("stream_viewer_sessions")
    .select("id")
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
  return NextResponse.json({ ok: true, credit: data?.[0] ?? null }, { headers: { "Cache-Control": "private, no-store" } });
}
