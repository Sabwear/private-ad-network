import { NextResponse } from "next/server";
import { authorizeChannel } from "@/lib/streaming/channel-access";
import { viewerTokenFromRequest } from "@/lib/streaming/viewer-session";

export async function GET(request: Request, { params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await params;
  const accessKey = new URL(request.url).searchParams.get("key") ?? "";
  const access = await authorizeChannel(channelId, accessKey, viewerTokenFromRequest(request));
  if (!access) return NextResponse.json({ error: "Channel unavailable" }, { status: 404 });

  return NextResponse.json(
    { serverTimeMs: Date.now() },
    { headers: { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer" } },
  );
}
