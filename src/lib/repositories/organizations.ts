import "server-only";

import { createClient } from "@/lib/supabase/server";
import { BUSINESS_LOGO_BUCKET } from "@/lib/storage/business-logo";

export type OrganizationAdminRow = {
  id: number;
  publicId: string;
  name: string;
  legalName: string;
  category: string;
  status: string;
  websiteUrl: string;
  contactEmail: string;
  contactPhone: string;
  logoUrl: string | null;
  logoPosition: string;
  logoSizePercent: number;
  streamAccessCode: string;
  streamAccessCodeExpiresAt: string;
  streamEarningEnabled: boolean;
  streamEarningRate: number;
  adConsumptionRate: number;
  operatingStartDate: string;
  operatingEndDate: string;
  operatingDays: string[];
  operatingOpensAt: string;
  operatingClosesAt: string;
  operatingTimeZone: string;
  busyPeriods: Array<{ id: number; day: string; start: string; end: string; multiplier: number }>;
  locationCount: number;
  createdAt: string;
  updatedAt: string;
  approvedAds: Array<{ id: number; name: string }>;
  channelAds: Array<{ itemId: number; channelId: number; channelName: string; assetId: number; assetName: string }>;
  streamChannels: Array<{ name: string; href: string }>;
  streamCodeRotations: Array<{ rotatedAt: string; expiresAt: string }>;
};

export type OrganizationAdminData = {
  source: "live" | "setup";
  organizations: OrganizationAdminRow[];
  channels: Array<{ id: number; name: string; status: string }>;
};

const setupErrorCodes = new Set(["PGRST204", "PGRST205", "42501", "42703", "42P01"]);

export async function getOrganizationAdminData(): Promise<OrganizationAdminData> {
  const supabase = await createClient();
  const [organizationsResult, locationsResult, brandingResult, streamSettingsResult, scheduleResult, busyPeriodsResult, channelsResult, channelAssignmentsResult, channelItemsResult, mediaResult, rotationsResult] = await Promise.all([
    supabase.from("organizations").select("id,public_id,display_name,legal_name,category,status,created_at,updated_at").order("created_at", { ascending: false }),
    supabase.from("locations").select("id,organization_id"),
    supabase.from("organizations").select("id,website_url,contact_email,contact_phone,logo_storage_path,logo_position,logo_size_percent"),
    supabase.from("organizations").select("id,stream_access_code,stream_access_code_expires_at,stream_earning_enabled,stream_earning_rate,ad_consumption_rate"),
    supabase.from("organizations").select("id,operating_start_date,operating_end_date,operating_days,operating_opens_at,operating_closes_at,operating_time_zone"),
    supabase.from("organization_busy_periods").select("id,organization_id,day_of_week,starts_at,ends_at,consumption_multiplier").order("starts_at"),
    supabase.from("streaming_channels").select("id,public_id,access_key,slug,custom_hostname,name,status").order("name"),
    supabase.from("streaming_channel_organizations").select("channel_id,organization_id"),
    supabase.from("streaming_channel_items").select("id,channel_id,media_asset_id,status").eq("status", "active"),
    supabase.from("media_assets").select("id,organization_id,name,moderation_status,processing_status").eq("moderation_status", "approved").eq("processing_status", "ready").order("name"),
    supabase.from("stream_access_code_rotations").select("organization_id,rotated_at,expires_at").order("rotated_at", { ascending: false }).limit(500),
  ]);

  const error = organizationsResult.error ?? locationsResult.error;
  if (error) {
    if (setupErrorCodes.has(error.code)) return { source: "setup", organizations: [], channels: [] };
    throw new Error(`Unable to load organization administration: ${error.message}`);
  }

  const locationCounts = new Map<number, number>();
  for (const location of locationsResult.data ?? []) {
    locationCounts.set(location.organization_id, (locationCounts.get(location.organization_id) ?? 0) + 1);
  }
  const channelRecords = channelsResult.error ? [] : channelsResult.data ?? [];
  const brandingByOrganization = new Map((brandingResult.error ? [] : brandingResult.data ?? []).map((item) => [item.id, item]));
  const streamSettingsByOrganization = new Map((streamSettingsResult.error ? [] : streamSettingsResult.data ?? []).map((item) => [item.id, item]));
  const scheduleByOrganization = new Map((scheduleResult.error ? [] : scheduleResult.data ?? []).map((item) => [item.id, item]));
  const busyPeriodsByOrganization = new Map<number, OrganizationAdminRow["busyPeriods"]>();
  for (const period of busyPeriodsResult.error ? [] : busyPeriodsResult.data ?? []) {
    const current = busyPeriodsByOrganization.get(period.organization_id) ?? [];
    current.push({ id: period.id, day: period.day_of_week, start: period.starts_at.slice(0, 5), end: period.ends_at.slice(0, 5), multiplier: Number(period.consumption_multiplier) });
    busyPeriodsByOrganization.set(period.organization_id, current);
  }
  const channels = channelRecords.map((channel) => ({ id: channel.id, name: channel.name, status: channel.status }));
  const channelNames = new Map(channels.map((channel) => [channel.id, channel.name]));
  const channelById = new Map(channelRecords.map((channel) => [channel.id, channel]));
  const streamChannelsByOrganization = new Map<number, OrganizationAdminRow["streamChannels"]>();
  for (const assignment of channelAssignmentsResult.error ? [] : channelAssignmentsResult.data ?? []) {
    const channel = channelById.get(assignment.channel_id);
    if (!channel) continue;
    const current = streamChannelsByOrganization.get(assignment.organization_id) ?? [];
    current.push({ name: channel.name, href: channel.custom_hostname ? `https://${channel.custom_hostname}` : `/watch/${channel.slug}` });
    streamChannelsByOrganization.set(assignment.organization_id, current);
  }
  const rotationsByOrganization = new Map<number, OrganizationAdminRow["streamCodeRotations"]>();
  for (const rotation of rotationsResult.error ? [] : rotationsResult.data ?? []) {
    const current = rotationsByOrganization.get(rotation.organization_id) ?? [];
    if (current.length < 10) current.push({ rotatedAt: rotation.rotated_at, expiresAt: rotation.expires_at });
    rotationsByOrganization.set(rotation.organization_id, current);
  }
  const approvedAdsByOrganization = new Map<number, Array<{ id: number; name: string }>>();
  const mediaById = new Map<number, { organizationId: number; name: string }>();
  for (const asset of mediaResult.error ? [] : mediaResult.data ?? []) {
    mediaById.set(asset.id, { organizationId: asset.organization_id, name: asset.name });
    const current = approvedAdsByOrganization.get(asset.organization_id) ?? [];
    current.push({ id: asset.id, name: asset.name });
    approvedAdsByOrganization.set(asset.organization_id, current);
  }
  const channelAdsByOrganization = new Map<number, OrganizationAdminRow["channelAds"]>();
  for (const item of channelItemsResult.error ? [] : channelItemsResult.data ?? []) {
    const asset = mediaById.get(item.media_asset_id);
    if (!asset) continue;
    const current = channelAdsByOrganization.get(asset.organizationId) ?? [];
    current.push({ itemId: item.id, channelId: item.channel_id, channelName: channelNames.get(item.channel_id) ?? "Unknown channel", assetId: item.media_asset_id, assetName: asset.name });
    channelAdsByOrganization.set(asset.organizationId, current);
  }

  return {
    source: "live",
    channels,
    organizations: (organizationsResult.data ?? []).map((organization) => {
      const branding = brandingByOrganization.get(organization.id);
      const streamSettings = streamSettingsByOrganization.get(organization.id);
      const schedule = scheduleByOrganization.get(organization.id);
      return {
        id: organization.id,
        publicId: organization.public_id,
        name: organization.display_name,
        legalName: organization.legal_name ?? "—",
        category: organization.category,
        status: organization.status,
        websiteUrl: branding?.website_url ?? "",
        contactEmail: branding?.contact_email ?? "",
        contactPhone: branding?.contact_phone ?? "",
        logoUrl: branding?.logo_storage_path ? supabase.storage.from(BUSINESS_LOGO_BUCKET).getPublicUrl(branding.logo_storage_path).data.publicUrl : null,
        logoPosition: branding?.logo_position ?? "bottom-left",
        logoSizePercent: branding?.logo_size_percent ?? 14,
        streamAccessCode: streamSettings?.stream_access_code ?? "Not configured",
        streamAccessCodeExpiresAt: streamSettings?.stream_access_code_expires_at ?? "",
        streamEarningEnabled: streamSettings?.stream_earning_enabled ?? false,
        streamEarningRate: streamSettings?.stream_earning_rate ?? 0,
        adConsumptionRate: streamSettings?.ad_consumption_rate ?? 0,
        operatingStartDate: schedule?.operating_start_date ?? "",
        operatingEndDate: schedule?.operating_end_date ?? "",
        operatingDays: schedule?.operating_days ?? ["mon", "tue", "wed", "thu", "fri"],
        operatingOpensAt: schedule?.operating_opens_at?.slice(0, 5) ?? "09:00",
        operatingClosesAt: schedule?.operating_closes_at?.slice(0, 5) ?? "18:00",
        operatingTimeZone: schedule?.operating_time_zone ?? "Africa/Casablanca",
        busyPeriods: busyPeriodsByOrganization.get(organization.id) ?? [],
        locationCount: locationCounts.get(organization.id) ?? 0,
        createdAt: organization.created_at,
        updatedAt: organization.updated_at,
        approvedAds: approvedAdsByOrganization.get(organization.id) ?? [],
        channelAds: channelAdsByOrganization.get(organization.id) ?? [],
        streamChannels: streamChannelsByOrganization.get(organization.id) ?? [],
        streamCodeRotations: rotationsByOrganization.get(organization.id) ?? [],
      };
    }),
  };
}
