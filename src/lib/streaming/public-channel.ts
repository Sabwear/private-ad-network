import "server-only";

import { cache } from "react";
import { authorizeChannel } from "@/lib/streaming/channel-access";
import { BUSINESS_LOGO_BUCKET } from "@/lib/storage/business-logo";
import type { ChannelDisplaySettings } from "@/components/channel-display-settings-fields";

export type PublicChannelStream = {
  name: string;
  description: string;
  publicId: string;
  serverTimeMs: number;
  broadcastStartedAt: string;
  clockUrl: string;
  settings: ChannelDisplaySettings;
  items: Array<{ id: string; name: string; sourceType: "upload" | "youtube"; youtubeVideoId: string | null; durationMs: number; hlsUrl: string | null; fallbackUrl: string | null; advertiserName: string; logoUrl: string | null; logoPosition: string; logoSizePercent: number }>;
};

function currentBusyMultiplier(host: { operating_time_zone: string; operating_start_date: string | null; operating_end_date: string | null; operating_days: string[]; operating_opens_at: string; operating_closes_at: string } | null, periods: Array<{ day_of_week: string; starts_at: string; ends_at: string; consumption_multiplier: number }>) {
  if (!host) return 1;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: host.operating_time_zone, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const day = value.weekday?.toLowerCase();
  const time = `${value.hour}:${value.minute}`;
  const date = `${value.year}-${value.month}-${value.day}`;
  const open = Boolean(day && host.operating_days.includes(day) && (!host.operating_start_date || date >= host.operating_start_date) && (!host.operating_end_date || date <= host.operating_end_date) && time >= host.operating_opens_at.slice(0, 5) && time < host.operating_closes_at.slice(0, 5));
  if (!open) return 1;
  return periods.filter((period) => period.day_of_week === day && period.starts_at.slice(0, 5) <= time && period.ends_at.slice(0, 5) > time)
    .reduce((peak, period) => Math.max(peak, Number(period.consumption_multiplier)), 1);
}

export const getPublicChannelStream = cache(async (channelPublicId: string, accessKey: string, viewerToken: string): Promise<PublicChannelStream | null> => {
  const access = await authorizeChannel(channelPublicId, accessKey, viewerToken);
  if (!access) return null;
  const { data: items } = await access.admin.from("streaming_channel_items").select("media_asset_id,position").eq("channel_id", access.channel.id).eq("status", "active").order("position");
  const assetIds = (items ?? []).map((item) => item.media_asset_id);
  const { data: assets } = assetIds.length ? await access.admin.from("media_assets").select("id,public_id,organization_id,name,source_type,external_id,duration_ms,hls_master_storage_path").in("id", assetIds).eq("moderation_status", "approved").eq("processing_status", "ready") : { data: [] };
  const assetsById = new Map((assets ?? []).map((asset) => [asset.id, asset]));
  const organizationIds = [...new Set((assets ?? []).map((asset) => asset.organization_id))];
  const hostOrganizationId = access.viewerSession.host_organization_id;
  const [{ data: organizations }, { data: wallets }, hostResult, busyPeriodsResult] = await Promise.all([
    organizationIds.length ? access.admin.from("organizations").select("id,display_name,logo_storage_path,logo_position,logo_size_percent,ad_consumption_rate").in("id", organizationIds) : Promise.resolve({ data: [] }),
    organizationIds.length ? access.admin.from("wallets").select("organization_id,wallet_type,balance_projection").in("organization_id", organizationIds).in("wallet_type", ["promotional", "earned", "purchased"]) : Promise.resolve({ data: [] }),
    hostOrganizationId ? access.admin.from("organizations").select("operating_time_zone,operating_start_date,operating_end_date,operating_days,operating_opens_at,operating_closes_at").eq("id", hostOrganizationId).maybeSingle() : Promise.resolve({ data: null }),
    hostOrganizationId ? access.admin.from("organization_busy_periods").select("day_of_week,starts_at,ends_at,consumption_multiplier").eq("organization_id", hostOrganizationId) : Promise.resolve({ data: [] }),
  ]);
  const busyMultiplier = currentBusyMultiplier(hostResult.data, busyPeriodsResult.data ?? []);
  const organizationsById = new Map((organizations ?? []).map((organization) => [organization.id, organization]));
  const spendableByOrganization = new Map<number, number>();
  for (const wallet of wallets ?? []) {
    if (wallet.organization_id === null) continue;
    spendableByOrganization.set(wallet.organization_id, (spendableByOrganization.get(wallet.organization_id) ?? 0) + Math.max(0, Number(wallet.balance_projection)));
  }
  return {
    publicId: access.channel.public_id,
    name: access.channel.name,
    description: access.channel.description ?? "",
    serverTimeMs: Date.now(),
    broadcastStartedAt: access.channel.broadcast_started_at,
    clockUrl: `/api/v1/channels/${encodeURIComponent(channelPublicId)}/clock?key=${encodeURIComponent(accessKey)}`,
    settings: {
      broadcastEnabled: access.channel.broadcast_enabled,
      showLiveBadge: access.channel.show_live_badge,
      showChannelName: access.channel.show_channel_name,
      showNowPlaying: access.channel.show_now_playing,
      showAudioControl: access.channel.show_audio_control,
      showAdvertiserLogo: access.channel.show_advertiser_logo,
      showStripeBanner: access.channel.show_stripe_banner,
      showVideoTime: access.channel.show_video_time,
      showFullscreenControl: access.channel.show_fullscreen_control,
      showLeaveControl: access.channel.show_leave_control,
      showViewerLogin: access.channel.show_viewer_login,
      showChannelDescription: access.channel.show_channel_description,
      showProgressBar: access.channel.show_progress_bar,
      stripeBannerText: access.channel.stripe_banner_text ?? "",
      stripeBannerPosition: access.channel.stripe_banner_position as "top" | "bottom",
      videoFit: access.channel.video_fit as "contain" | "cover",
      overlayPosition: access.channel.overlay_position as "top" | "bottom",
      overlayStyle: access.channel.overlay_style as "gradient" | "glass" | "minimal",
      accentColor: access.channel.accent_color,
    },
    items: (items ?? []).flatMap((item) => {
      const asset = assetsById.get(item.media_asset_id);
      if (!asset) return [];
      const organization = organizationsById.get(asset.organization_id);
      const durationMs = Math.max(asset.duration_ms ?? 15_000, 1_000);
      const requiredCredits = Number(organization?.ad_consumption_rate ?? 0) * busyMultiplier * durationMs / 60_000;
      if ((spendableByOrganization.get(asset.organization_id) ?? 0) + Number.EPSILON < requiredCredits) return [];
      const base = `/api/v1/channels/${channelPublicId}`;
      return [{
        id: asset.public_id,
        name: asset.name,
        sourceType: asset.source_type === "youtube" ? "youtube" as const : "upload" as const,
        youtubeVideoId: asset.source_type === "youtube" ? asset.external_id : null,
        durationMs,
        hlsUrl: asset.hls_master_storage_path ? `${base}/hls/${asset.public_id}/master.m3u8?key=${accessKey}` : null,
        fallbackUrl: asset.source_type === "youtube" ? null : `${base}/media/${asset.public_id}?key=${accessKey}`,
        advertiserName: organization?.display_name ?? "Advertiser",
        logoUrl: organization?.logo_storage_path ? access.admin.storage.from(BUSINESS_LOGO_BUCKET).getPublicUrl(organization.logo_storage_path).data.publicUrl : null,
        logoPosition: organization?.logo_position ?? "bottom-left",
        logoSizePercent: organization?.logo_size_percent ?? 14,
      }];
    }),
  };
});
