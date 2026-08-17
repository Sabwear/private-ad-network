import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashViewerToken } from "@/lib/streaming/viewer-session";

const credentialSchema = z.object({ channelPublicId: z.string().uuid(), accessKey: z.string().uuid() });
const channelSelection = "id,public_id,access_key,name,description,status,broadcast_enabled,broadcast_started_at,show_live_badge,show_channel_name,show_now_playing,show_audio_control,show_advertiser_logo,show_stripe_banner,show_video_time,stripe_banner_text,stripe_banner_position,video_fit";

export async function getChannelAccessPreview(channelPublicId: string, accessKey: string) {
  const credentials = credentialSchema.safeParse({ channelPublicId, accessKey });
  if (!credentials.success) return null;
  const admin = createAdminClient();
  const { data: channel } = await admin.from("streaming_channels").select(channelSelection).eq("public_id", credentials.data.channelPublicId).eq("access_key", credentials.data.accessKey).eq("status", "active").maybeSingle();
  return channel ? { admin, channel } : null;
}

export async function getChannelAccessBySlug(slug: string) {
  const parsed = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).safeParse(slug);
  if (!parsed.success) return null;
  const admin = createAdminClient();
  const { data: channel } = await admin.from("streaming_channels").select(channelSelection).eq("slug", parsed.data).eq("status", "active").maybeSingle();
  return channel ? { admin, channel } : null;
}

export async function authorizeChannel(channelPublicId: string, accessKey: string, viewerToken: string | null) {
  if (!viewerToken) return null;
  const preview = await getChannelAccessPreview(channelPublicId, accessKey);
  if (!preview) return null;
  const { data: session } = await preview.admin
    .from("stream_viewer_sessions")
    .select("id,host_organization_id,viewer_mode,viewer_user_id")
    .eq("channel_id", preview.channel.id)
    .eq("token_hash", hashViewerToken(viewerToken))
    .is("ended_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!session) return null;
  if (session.viewer_mode === "registered") {
    const { data: profile } = await preview.admin
      .from("profiles")
      .select("id")
      .eq("id", session.viewer_user_id ?? "00000000-0000-0000-0000-000000000000")
      .eq("account_status", "active")
      .not("email_verified_at", "is", null)
      .maybeSingle();
    if (!profile) return null;
  }
  return { ...preview, viewerSession: session };
}

export async function authorizeChannelAsset(channelPublicId: string, accessKey: string, assetPublicId: string, viewerToken: string | null) {
  const access = await authorizeChannel(channelPublicId, accessKey, viewerToken);
  const parsedAssetId = z.string().uuid().safeParse(assetPublicId);
  if (!access || !parsedAssetId.success) return null;
  const { data: asset } = await access.admin.from("media_assets").select("id,public_id,name,normalized_storage_path,hls_master_storage_path").eq("public_id", parsedAssetId.data).eq("source_type", "upload").eq("moderation_status", "approved").eq("processing_status", "ready").maybeSingle();
  if (!asset) return null;
  const { data: item } = await access.admin.from("streaming_channel_items").select("id").eq("channel_id", access.channel.id).eq("media_asset_id", asset.id).eq("status", "active").maybeSingle();
  return item ? { ...access, asset } : null;
}
