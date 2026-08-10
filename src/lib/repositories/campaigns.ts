import "server-only";

import type { StatusTone } from "@/lib/platform-data";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseAdminEnv, hasSupabaseEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type CampaignCard = {
  publicId: string;
  organizationId: number;
  organization: string;
  name: string;
  mediaAssetId: number;
  asset: string;
  status: string;
  spent: number;
  budget: number;
  plays: number;
  pace: string;
  tone: StatusTone;
  dates: string;
  startsOn: string;
  endsOn: string;
  dailyCapCredits: number | null;
  frequencyCapPerDay: number | null;
  targetIds: number[];
  targets: string[];
};

export type CampaignWorkspace = {
  source: "supabase" | "setup";
  canCreate: boolean;
  canManage: boolean;
  isPlatformAdmin: boolean;
  campaigns: CampaignCard[];
  advertiserOptions: Array<{ id: number; name: string; category: string }>;
  mediaOptions: Array<{ id: number; name: string; organizationId: number; organization: string }>;
  targetOptions: Array<{ id: number; name: string; category: string }>;
};

function statusTone(status: string): StatusTone {
  if (status === "active") return "success";
  if (status === "scheduled") return "info";
  if (status === "paused") return "neutral";
  if (status === "cancelled") return "danger";
  return "warning";
}

function formatDateRange(startsAt: string, endsAt: string) {
  const format = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `${format.format(new Date(startsAt))} – ${format.format(new Date(endsAt))}`;
}

export async function getCampaignWorkspace(): Promise<CampaignWorkspace> {
  if (!hasSupabaseEnv()) return { source: "setup", canCreate: false, canManage: false, isPlatformAdmin: false, campaigns: [], advertiserOptions: [], mediaOptions: [], targetOptions: [] };

  const workspace = await getWorkspaceContext();
  const supabase = await createClient();
  const isPlatformAdmin = workspace.permissions.canAccessAdmin;
  const isBusinessManager = workspace.organization.id !== null && ["owner", "staff"].includes(workspace.membership.role);
  const canCreate = workspace.mode === "active" && (isPlatformAdmin || isBusinessManager);
  const campaignQuery = supabase.from("campaigns").select("id,public_id,organization_id,name,status,media_asset_id,budget_credits,spent_credits,daily_cap_credits,frequency_cap_per_day,starts_at,ends_at").order("created_at", { ascending: false });
  const mediaQuery = canCreate
    ? (() => {
        const query = supabase.from("media_assets").select("id,name,organization_id").eq("moderation_status", "approved").eq("processing_status", "ready").order("name");
        return isPlatformAdmin ? query : query.eq("organization_id", workspace.organization.id!);
      })()
    : Promise.resolve({ data: [], error: null });
  const directoryClient = isPlatformAdmin ? supabase : hasSupabaseAdminEnv() ? createAdminClient() : null;
  const directoryQuery = canCreate && directoryClient
    ? directoryClient.from("organizations").select("id,display_name,category").eq("status", "active").order("display_name")
    : Promise.resolve({ data: [], error: null });

  const [{ data: campaigns, error }, mediaResult, directoryResult] = await Promise.all([campaignQuery, mediaQuery, directoryQuery]);
  if (error) {
    if (error.code === "PGRST205" || error.code === "42501") return { source: "setup", canCreate: false, canManage: false, isPlatformAdmin, campaigns: [], advertiserOptions: [], mediaOptions: [], targetOptions: [] };
    throw new Error(`Unable to load campaigns: ${error.message}`);
  }
  if (mediaResult.error) throw new Error("Unable to load approved campaign media.");
  if (directoryResult.error) throw new Error("Unable to load target businesses.");

  const campaignIds = (campaigns ?? []).map((campaign) => campaign.id);
  const mediaIds = [...new Set((campaigns ?? []).map((campaign) => campaign.media_asset_id))];
  const [assetResult, targetResult] = await Promise.all([
    mediaIds.length ? supabase.from("media_assets").select("id,name").in("id", mediaIds) : Promise.resolve({ data: [], error: null }),
    campaignIds.length ? supabase.from("campaign_target_organizations").select("campaign_id,organization_id").in("campaign_id", campaignIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (assetResult.error || targetResult.error) throw new Error("Unable to load campaign details.");

  const targetOrganizationIds = [...new Set((targetResult.data ?? []).map((target) => target.organization_id))];
  const targetOrganizationClient = isPlatformAdmin ? supabase : hasSupabaseAdminEnv() ? createAdminClient() : null;
  const targetOrganizations = targetOrganizationIds.length && targetOrganizationClient
    ? await targetOrganizationClient.from("organizations").select("id,display_name").in("id", targetOrganizationIds)
    : { data: [], error: null };
  if (targetOrganizations.error) throw new Error("Unable to load campaign targets.");

  const assetNames = new Map((assetResult.data ?? []).map((asset) => [asset.id, asset.name]));
  const organizationNames = new Map((targetOrganizations.data ?? []).map((organization) => [organization.id, organization.display_name]));
  for (const organization of directoryResult.data ?? []) organizationNames.set(organization.id, organization.display_name);
  if (workspace.organization.id) organizationNames.set(workspace.organization.id, workspace.organization.name);
  const targetsByCampaign = new Map<number, Array<{ id: number; name: string }>>();
  for (const target of targetResult.data ?? []) {
    const name = organizationNames.get(target.organization_id);
    if (name) targetsByCampaign.set(target.campaign_id, [...(targetsByCampaign.get(target.campaign_id) ?? []), { id: target.organization_id, name }]);
  }

  const advertisers = (directoryResult.data ?? []).map((organization) => ({ id: organization.id, name: organization.display_name, category: organization.category }));
  const mediaOrganizationNames = new Map(advertisers.map((organization) => [organization.id, organization.name]));
  if (workspace.organization.id) mediaOrganizationNames.set(workspace.organization.id, workspace.organization.name);

  return {
    source: "supabase",
    canCreate,
    canManage: canCreate,
    isPlatformAdmin,
    advertiserOptions: isPlatformAdmin ? advertisers : advertisers.filter((organization) => organization.id === workspace.organization.id),
    mediaOptions: (mediaResult.data ?? []).map((asset) => ({ id: asset.id, name: asset.name, organizationId: asset.organization_id, organization: mediaOrganizationNames.get(asset.organization_id) ?? "Unknown business" })),
    targetOptions: advertisers,
    campaigns: (campaigns ?? []).map((campaign) => ({
      publicId: campaign.public_id,
      organizationId: campaign.organization_id,
      organization: organizationNames.get(campaign.organization_id) ?? "Unknown business",
      name: campaign.name,
      mediaAssetId: campaign.media_asset_id,
      asset: assetNames.get(campaign.media_asset_id) ?? "Approved media",
      status: campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1),
      spent: Number(campaign.spent_credits),
      budget: Number(campaign.budget_credits),
      plays: 0,
      pace: campaign.status === "active" ? "Calculating" : campaign.status === "scheduled" ? "Not started" : campaign.status === "draft" ? "Draft plan" : "Paused",
      tone: statusTone(campaign.status),
      dates: formatDateRange(campaign.starts_at, campaign.ends_at),
      startsOn: campaign.starts_at.slice(0, 10),
      endsOn: campaign.ends_at.slice(0, 10),
      dailyCapCredits: campaign.daily_cap_credits === null ? null : Number(campaign.daily_cap_credits),
      frequencyCapPerDay: campaign.frequency_cap_per_day,
      targetIds: (targetsByCampaign.get(campaign.id) ?? []).map((target) => target.id),
      targets: (targetsByCampaign.get(campaign.id) ?? []).map((target) => target.name),
    })),
  };
}

export async function getCampaignCards() {
  const workspace = await getCampaignWorkspace();
  return { source: workspace.source, campaigns: workspace.campaigns };
}
