import { NextResponse } from "next/server";
import { authorizeChannelAsset } from "@/lib/streaming/channel-access";
import { MEDIA_BUCKET } from "@/lib/storage/media-storage";

const safePart = /^[a-zA-Z0-9._-]+$/;

export async function GET(request: Request, { params }: { params: Promise<{ channelId: string; assetId: string; resource: string[] }> }) {
  const { channelId, assetId, resource } = await params;
  const accessKey = new URL(request.url).searchParams.get("key") ?? "";
  if (!resource.length || resource.some((part) => !safePart.test(part) || part === "." || part === "..")) return new NextResponse("Not found", { status: 404 });
  const access = await authorizeChannelAsset(channelId, accessKey, assetId);
  const masterPath = access?.asset.hls_master_storage_path;
  if (!access || !masterPath) return new NextResponse("Stream unavailable", { status: 404 });
  const root = masterPath.slice(0, -"master.m3u8".length);
  const storagePath = `${root}${resource.join("/")}`;

  if (!storagePath.endsWith(".m3u8")) {
    const { data, error } = await access.admin.storage.from(MEDIA_BUCKET).createSignedUrl(storagePath, 5 * 60);
    if (error || !data?.signedUrl) return new NextResponse("Segment unavailable", { status: 404 });
    return NextResponse.redirect(data.signedUrl, { status: 307, headers: { "Cache-Control": "private, max-age=240", "Referrer-Policy": "no-referrer" } });
  }

  const { data, error } = await access.admin.storage.from(MEDIA_BUCKET).download(storagePath);
  if (error || !data) return new NextResponse("Playlist unavailable", { status: 404 });
  const prefix = `/api/v1/channels/${channelId}/hls/${assetId}`;
  const parent = resource.slice(0, -1);
  const playlist = (await data.text()).split("\n").map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const target = [...parent, ...trimmed.split("/")];
    if (target.some((part) => !safePart.test(part))) return "";
    return `${prefix}/${target.map(encodeURIComponent).join("/")}?key=${encodeURIComponent(accessKey)}`;
  }).join("\n");
  return new NextResponse(playlist, { headers: { "Content-Type": "application/vnd.apple.mpegurl", "Cache-Control": "private, max-age=10", "X-Content-Type-Options": "nosniff" } });
}
