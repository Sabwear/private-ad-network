import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ChannelDisplaySettings } from "@/components/channel-display-settings-fields";

export type StreamingChannel = {
  id: number;
  publicId: string;
  accessKey: string;
  slug: string;
  customHostname: string;
  name: string;
  description: string;
  status: string;
  streamPath: string;
  settings: ChannelDisplaySettings;
  organizations: Array<{ id: number; name: string }>;
  items: Array<{ id: number; assetId: number; name: string; owner: string; position: number; hasHls: boolean; sourceType: "upload" | "youtube" }>;
};

export type ChannelManagementData = {
  source: "live" | "setup";
  channels: StreamingChannel[];
  organizations: Array<{ id: number; name: string; status: string }>;
  availableMedia: Array<{ id: number; name: string; owner: string; hasHls: boolean; sourceType: "upload" | "youtube" }>;
};

const setupCodes = new Set(["PGRST204", "PGRST205", "42501"]);

export async function getChannelManagementData(): Promise<ChannelManagementData> {
  const supabase = await createClient();
  const [channelsResult, assignmentsResult, itemsResult, organizationsResult, mediaResult] = await Promise.all([
    supabase.from("streaming_channels").select("id,public_id,access_key,name,slug,custom_hostname,description,status,broadcast_enabled,broadcast_started_at,show_live_badge,show_channel_name,show_now_playing,show_audio_control,show_advertiser_logo,show_stripe_banner,show_video_time,show_fullscreen_control,show_leave_control,show_viewer_login,show_channel_description,show_progress_bar,stripe_banner_text,stripe_banner_position,video_fit,overlay_position,overlay_style,accent_color").order("created_at"),
    supabase.from("streaming_channel_organizations").select("channel_id,organization_id"),
    supabase.from("streaming_channel_items").select("id,channel_id,media_asset_id,position,status").eq("status", "active").order("position"),
    supabase.from("organizations").select("id,display_name,status").order("display_name"),
    supabase.from("media_assets").select("id,name,organization_id,source_type,hls_master_storage_path,moderation_status,processing_status").eq("moderation_status", "approved").eq("processing_status", "ready").order("name"),
  ]);

  const error = channelsResult.error ?? assignmentsResult.error ?? itemsResult.error ?? organizationsResult.error ?? mediaResult.error;
  if (error) {
    if (setupCodes.has(error.code)) return { source: "setup", channels: [], organizations: [], availableMedia: [] };
    throw new Error(`Unable to load streaming channels: ${error.message}`);
  }

  const organizations = (organizationsResult.data ?? []).map((organization) => ({
    id: organization.id,
    name: organization.display_name,
    status: organization.status,
  }));
  const organizationNames = new Map(organizations.map((organization) => [organization.id, organization.name]));
  const media = (mediaResult.data ?? []).map((asset) => ({
    id: asset.id,
    name: asset.name,
    owner: organizationNames.get(asset.organization_id) ?? "Unknown business",
    hasHls: Boolean(asset.hls_master_storage_path),
    sourceType: asset.source_type === "youtube" ? "youtube" as const : "upload" as const,
  }));
  const mediaById = new Map(media.map((asset) => [asset.id, asset]));

  const channels = (channelsResult.data ?? []).map((channel): StreamingChannel => ({
    id: channel.id,
    publicId: channel.public_id,
    accessKey: channel.access_key,
    slug: channel.slug,
    customHostname: channel.custom_hostname ?? "",
    name: channel.name,
    description: channel.description ?? "",
    status: channel.status,
    streamPath: `/watch/${channel.slug}`,
    settings: {
      broadcastEnabled: channel.broadcast_enabled,
      showLiveBadge: channel.show_live_badge,
      showChannelName: channel.show_channel_name,
      showNowPlaying: channel.show_now_playing,
      showAudioControl: channel.show_audio_control,
      showAdvertiserLogo: channel.show_advertiser_logo,
      showStripeBanner: channel.show_stripe_banner,
      showVideoTime: channel.show_video_time,
      showFullscreenControl: channel.show_fullscreen_control,
      showLeaveControl: channel.show_leave_control,
      showViewerLogin: channel.show_viewer_login,
      showChannelDescription: channel.show_channel_description,
      showProgressBar: channel.show_progress_bar,
      stripeBannerText: channel.stripe_banner_text ?? "",
      stripeBannerPosition: channel.stripe_banner_position as "top" | "bottom",
      videoFit: channel.video_fit as "contain" | "cover",
      overlayPosition: channel.overlay_position as "top" | "bottom",
      overlayStyle: channel.overlay_style as "gradient" | "glass" | "minimal",
      accentColor: channel.accent_color,
    },
    organizations: (assignmentsResult.data ?? [])
      .filter((assignment) => assignment.channel_id === channel.id)
      .map((assignment) => ({ id: assignment.organization_id, name: organizationNames.get(assignment.organization_id) ?? "Unknown business" })),
    items: (itemsResult.data ?? [])
      .filter((item) => item.channel_id === channel.id)
      .flatMap((item) => {
        const asset = mediaById.get(item.media_asset_id);
        return asset ? [{ id: item.id, assetId: asset.id, name: asset.name, owner: asset.owner, position: item.position, hasHls: asset.hasHls, sourceType: asset.sourceType }] : [];
      }),
  }));

  return { source: "live", channels, organizations, availableMedia: media };
}
