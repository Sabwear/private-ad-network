import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const credentialSchema = z.object({ channelPublicId: z.string().uuid(), accessKey: z.string().uuid() });

export async function authorizeChannel(channelPublicId: string, accessKey: string) {
  const credentials = credentialSchema.safeParse({ channelPublicId, accessKey });
  if (!credentials.success) return null;
  const admin = createAdminClient();
  const { data } = await admin.from("streaming_channels").select("id,public_id,name,description,status,broadcast_enabled,broadcast_started_at,show_live_badge,show_channel_name,show_now_playing,show_audio_control,show_advertiser_logo,show_stripe_banner,show_video_time,stripe_banner_text,stripe_banner_position,video_fit").eq("public_id", credentials.data.channelPublicId).eq("access_key", credentials.data.accessKey).eq("status", "active").maybeSingle();
  return data ? { admin, channel: data } : null;
}

export async function authorizeChannelAsset(channelPublicId: string, accessKey: string, assetPublicId: string) {
  const access = await authorizeChannel(channelPublicId, accessKey);
  const parsedAssetId = z.string().uuid().safeParse(assetPublicId);
  if (!access || !parsedAssetId.success) return null;
  const { data: asset } = await access.admin.from("media_assets").select("id,public_id,name,normalized_storage_path,hls_master_storage_path").eq("public_id", parsedAssetId.data).eq("moderation_status", "approved").eq("processing_status", "ready").maybeSingle();
  if (!asset) return null;
  const { data: item } = await access.admin.from("streaming_channel_items").select("id").eq("channel_id", access.channel.id).eq("media_asset_id", asset.id).eq("status", "active").maybeSingle();
  return item ? { ...access, asset } : null;
}
