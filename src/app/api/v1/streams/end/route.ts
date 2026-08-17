import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashViewerToken, STREAM_VIEWER_COOKIE, viewerTokenFromRequest } from "@/lib/streaming/viewer-session";

export async function POST(request: Request) {
  const token = viewerTokenFromRequest(request);
  if (!token) return NextResponse.json({ error: "Viewer session unavailable" }, { status: 401 });
  const admin = createAdminClient();
  const { error } = await admin
    .from("stream_viewer_sessions")
    .update({ ended_at: new Date().toISOString(), last_activity_at: new Date().toISOString() })
    .eq("token_hash", hashViewerToken(token))
    .is("ended_at", null);
  if (error) return NextResponse.json({ error: "Viewer session could not be closed" }, { status: 500 });
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(STREAM_VIEWER_COOKIE);
  return response;
}
