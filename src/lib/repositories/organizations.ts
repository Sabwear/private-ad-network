import "server-only";

import { createClient } from "@/lib/supabase/server";
import { BUSINESS_LOGO_BUCKET } from "@/lib/storage/business-logo";

export type PendingAccount = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
};

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
  owner: string;
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
  pendingAccounts: PendingAccount[];
  organizations: OrganizationAdminRow[];
  channels: Array<{ id: number; name: string; status: string }>;
};

const setupErrorCodes = new Set(["PGRST205", "42501"]);

export async function getOrganizationAdminData(): Promise<OrganizationAdminData> {
  const supabase = await createClient();
  const [profilesResult, organizationsResult, membershipsResult, locationsResult, channelsResult, channelAssignmentsResult, channelItemsResult, mediaResult, rotationsResult] = await Promise.all([
    supabase.from("profiles").select("id,email,full_name,email_verified_at,account_status,platform_role,created_at").order("created_at", { ascending: true }),
    supabase.from("organizations").select("id,public_id,display_name,legal_name,category,status,website_url,contact_email,contact_phone,logo_storage_path,logo_position,logo_size_percent,stream_access_code,stream_access_code_expires_at,stream_earning_enabled,stream_earning_rate,ad_consumption_rate,created_at,updated_at").order("created_at", { ascending: false }),
    supabase.from("organization_memberships").select("organization_id,user_id,role,status").eq("role", "owner").eq("status", "active"),
    supabase.from("locations").select("id,organization_id"),
    supabase.from("streaming_channels").select("id,public_id,access_key,name,status").order("name"),
    supabase.from("streaming_channel_organizations").select("channel_id,organization_id"),
    supabase.from("streaming_channel_items").select("id,channel_id,media_asset_id,status").eq("status", "active"),
    supabase.from("media_assets").select("id,organization_id,name,moderation_status,processing_status").eq("moderation_status", "approved").eq("processing_status", "ready").order("name"),
    supabase.from("stream_access_code_rotations").select("organization_id,rotated_at,expires_at").order("rotated_at", { ascending: false }).limit(500),
  ]);

  const error = profilesResult.error ?? organizationsResult.error ?? membershipsResult.error ?? locationsResult.error ?? channelsResult.error ?? channelAssignmentsResult.error ?? channelItemsResult.error ?? mediaResult.error ?? rotationsResult.error;
  if (error) {
    if (setupErrorCodes.has(error.code) || error.code === "PGRST204") return { source: "setup", pendingAccounts: [], organizations: [], channels: [] };
    throw new Error(`Unable to load organization administration: ${error.message}`);
  }

  const profiles = profilesResult.data ?? [];
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const ownerByOrganization = new Map((membershipsResult.data ?? []).map((membership) => [membership.organization_id, membership.user_id]));
  const locationCounts = new Map<number, number>();
  for (const location of locationsResult.data ?? []) {
    locationCounts.set(location.organization_id, (locationCounts.get(location.organization_id) ?? 0) + 1);
  }
  const channelRecords = channelsResult.data ?? [];
  const channels = channelRecords.map((channel) => ({ id: channel.id, name: channel.name, status: channel.status }));
  const channelNames = new Map(channels.map((channel) => [channel.id, channel.name]));
  const channelById = new Map(channelRecords.map((channel) => [channel.id, channel]));
  const streamChannelsByOrganization = new Map<number, OrganizationAdminRow["streamChannels"]>();
  for (const assignment of channelAssignmentsResult.data ?? []) {
    const channel = channelById.get(assignment.channel_id);
    if (!channel) continue;
    const current = streamChannelsByOrganization.get(assignment.organization_id) ?? [];
    current.push({ name: channel.name, href: `/stream/${channel.public_id}/${channel.access_key}` });
    streamChannelsByOrganization.set(assignment.organization_id, current);
  }
  const rotationsByOrganization = new Map<number, OrganizationAdminRow["streamCodeRotations"]>();
  for (const rotation of rotationsResult.data ?? []) {
    const current = rotationsByOrganization.get(rotation.organization_id) ?? [];
    if (current.length < 10) current.push({ rotatedAt: rotation.rotated_at, expiresAt: rotation.expires_at });
    rotationsByOrganization.set(rotation.organization_id, current);
  }
  const approvedAdsByOrganization = new Map<number, Array<{ id: number; name: string }>>();
  const mediaById = new Map<number, { organizationId: number; name: string }>();
  for (const asset of mediaResult.data ?? []) {
    mediaById.set(asset.id, { organizationId: asset.organization_id, name: asset.name });
    const current = approvedAdsByOrganization.get(asset.organization_id) ?? [];
    current.push({ id: asset.id, name: asset.name });
    approvedAdsByOrganization.set(asset.organization_id, current);
  }
  const channelAdsByOrganization = new Map<number, OrganizationAdminRow["channelAds"]>();
  for (const item of channelItemsResult.data ?? []) {
    const asset = mediaById.get(item.media_asset_id);
    if (!asset) continue;
    const current = channelAdsByOrganization.get(asset.organizationId) ?? [];
    current.push({ itemId: item.id, channelId: item.channel_id, channelName: channelNames.get(item.channel_id) ?? "Unknown channel", assetId: item.media_asset_id, assetName: asset.name });
    channelAdsByOrganization.set(asset.organizationId, current);
  }

  return {
    source: "live",
    pendingAccounts: profiles
      .filter((profile) => profile.account_status === "pending" && profile.platform_role === "member" && profile.email_verified_at !== null)
      .map((profile) => ({
        id: profile.id,
        email: profile.email,
        name: profile.full_name ?? "Account holder",
        createdAt: profile.created_at,
      })),
    channels,
    organizations: (organizationsResult.data ?? []).map((organization) => {
      const ownerId = ownerByOrganization.get(organization.id);
      const ownerProfile = ownerId ? profileById.get(ownerId) : undefined;
      return {
        id: organization.id,
        publicId: organization.public_id,
        name: organization.display_name,
        legalName: organization.legal_name ?? "—",
        category: organization.category,
        status: organization.status,
        websiteUrl: organization.website_url ?? "",
        contactEmail: organization.contact_email ?? "",
        contactPhone: organization.contact_phone ?? "",
        logoUrl: organization.logo_storage_path ? supabase.storage.from(BUSINESS_LOGO_BUCKET).getPublicUrl(organization.logo_storage_path).data.publicUrl : null,
        logoPosition: organization.logo_position,
        logoSizePercent: organization.logo_size_percent,
        streamAccessCode: organization.stream_access_code,
        streamAccessCodeExpiresAt: organization.stream_access_code_expires_at,
        streamEarningEnabled: organization.stream_earning_enabled,
        streamEarningRate: organization.stream_earning_rate,
        adConsumptionRate: organization.ad_consumption_rate,
        owner: ownerProfile?.email ?? "Owner not assigned",
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
