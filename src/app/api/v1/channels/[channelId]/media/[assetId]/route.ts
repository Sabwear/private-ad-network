import { NextResponse } from "next/server";
import { authorizeChannelAsset } from "@/lib/streaming/channel-access";
import { createMediaReadUrl } from "@/lib/storage/media-storage";
import { viewerTokenFromRequest } from "@/lib/streaming/viewer-session";

export async function GET(request: Request, { params }: { params: Promise<{ channelId: string; assetId: string }> }) {
  const { channelId, assetId } = await params;
  const access = await authorizeChannelAsset(channelId, new URL(request.url).searchParams.get("key") ?? "", assetId, viewerTokenFromRequest(request));
  if (!access?.asset.normalized_storage_path) return NextResponse.json({ error: "Stream unavailable" }, { status: 404 });
  const signedUrl = await createMediaReadUrl(access.admin, access.asset.normalized_storage_path, 5 * 60);
  if (!signedUrl) return NextResponse.json({ error: "Stream unavailable" }, { status: 404 });
  return NextResponse.redirect(signedUrl, { status: 307, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}
