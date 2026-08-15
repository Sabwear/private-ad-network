import "server-only";

import { cache } from "react";
import { authorizeChannel } from "@/lib/streaming/channel-access";
import { BUSINESS_LOGO_BUCKET } from "@/lib/storage/business-logo";
import type { ChannelDisplaySettings } from "@/components/channel-display-settings-fields";

export type PublicChannelStream = {
  name: string;
  description: string;
  publicId: string;
  settings: ChannelDisplaySettings;
  items: Array<{ id: string; name: string; hlsUrl: string | null; fallbackUrl: string; advertiserName: string; logoUrl: string | null; logoPosition: string; logoSizePercent: number }>;
};

export const getPublicChannelStream = cache(async (channelPublicId: string, accessKey: string): Promise<PublicChannelStream | null> => {
  const access = await authorizeChannel(channelPublicId, accessKey);
  if (!access) return null;
  const { data: items } = await access.admin.from("streaming_channel_items").select("media_asset_id,position").eq("channel_id", access.channel.id).eq("status", "active").order("position");
  const assetIds = (items ?? []).map((item) => item.media_asset_id);
  const { data: assets } = assetIds.length ? await access.admin.from("media_assets").select("id,public_id,organization_id,name,hls_master_storage_path").in("id", assetIds).eq("moderation_status", "approved").eq("processing_status", "ready") : { data: [] };
  const assetsById = new Map((assets ?? []).map((asset) => [asset.id, asset]));
  const organizationIds = [...new Set((assets ?? []).map((asset) => asset.organization_id))];
  const { data: organizations } = organizationIds.length ? await access.admin.from("organizations").select("id,display_name,logo_storage_path,logo_position,logo_size_percent").in("id", organizationIds) : { data: [] };
  const organizationsById = new Map((organizations ?? []).map((organization) => [organization.id, organization]));
  return {
    publicId: access.channel.public_id,
    name: access.channel.name,
    description: access.channel.description ?? "",
    settings: {
      showLiveBadge: access.channel.show_live_badge,
      showChannelName: access.channel.show_channel_name,
      showNowPlaying: access.channel.show_now_playing,
      showAudioControl: access.channel.show_audio_control,
      showAdvertiserLogo: access.channel.show_advertiser_logo,
      showStripeBanner: access.channel.show_stripe_banner,
      showVideoTime: access.channel.show_video_time,
      stripeBannerText: access.channel.stripe_banner_text ?? "",
      stripeBannerPosition: access.channel.stripe_banner_position,
      videoFit: access.channel.video_fit,
    },
    items: (items ?? []).flatMap((item) => {
      const asset = assetsById.get(item.media_asset_id);
      if (!asset) return [];
      const organization = organizationsById.get(asset.organization_id);
      const base = `/api/v1/channels/${channelPublicId}`;
      return [{
        id: asset.public_id,
        name: asset.name,
        hlsUrl: asset.hls_master_storage_path ? `${base}/hls/${asset.public_id}/master.m3u8?key=${accessKey}` : null,
        fallbackUrl: `${base}/media/${asset.public_id}?key=${accessKey}`,
        advertiserName: organization?.display_name ?? "Advertiser",
        logoUrl: organization?.logo_storage_path ? access.admin.storage.from(BUSINESS_LOGO_BUCKET).getPublicUrl(organization.logo_storage_path).data.publicUrl : null,
        logoPosition: organization?.logo_position ?? "bottom-left",
        logoSizePercent: organization?.logo_size_percent ?? 14,
      }];
    }),
  };
});
