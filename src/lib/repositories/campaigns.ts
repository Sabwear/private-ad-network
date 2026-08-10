import "server-only";

import type { StatusTone } from "@/lib/platform-data";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseAdminEnv, hasSupabaseEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type CampaignCard = {
  publicId: string;
  name: string;
  asset: string;
  status: string;
  spent: number;
  budget: number;
  plays: number;
  pace: string;
  tone: StatusTone;
  dates: string;
  targets: string[];
};

export type CampaignWorkspace = {
  source: "supabase" | "setup";
  canCreate: boolean;
  campaigns: CampaignCard[];
  mediaOptions: Array<{ id: number; name: string }>;
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
  if (!hasSupabaseEnv()) return { source: "setup", canCreate: false, campaigns: [], mediaOptions: [], targetOptions: [] };

  const workspace = await getWorkspaceContext();
  const supabase = await createClient();
  const canCreate = workspace.mode === "active" && workspace.organization.id !== null && ["owner", "staff"].includes(workspace.membership.role);
  const campaignQuery = supabase.from("campaigns").select("id,public_id,name,status,media_asset_id,budget_credits,spent_credits,starts_at,ends_at").order("created_at", { ascending: false });
  const mediaQuery = canCreate
    ? supabase.from("media_assets").select("id,name").eq("organization_id", workspace.organization.id!).eq("moderation_status", "approved").eq("processing_status", "ready").order("name")
    : Promise.resolve({ data: [], error: null });
  const directoryQuery = canCreate && hasSupabaseAdminEnv()
    ? createAdminClient().from("organizations").select("id,display_name,category").eq("status", "active").neq("id", workspace.organization.id!).order("display_name")
    : Promise.resolve({ data: [], error: null });

  const [{ data: campaigns, error }, mediaResult, directoryResult] = await Promise.all([campaignQuery, mediaQuery, directoryQuery]);
  if (error) {
    if (error.code === "PGRST205" || error.code === "42501") return { source: "setup", canCreate: false, campaigns: [], mediaOptions: [], targetOptions: [] };
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
  const targetOrganizations = targetOrganizationIds.length && hasSupabaseAdminEnv()
    ? await createAdminClient().from("organizations").select("id,display_name").in("id", targetOrganizationIds)
    : { data: [], error: null };
  if (targetOrganizations.error) throw new Error("Unable to load campaign targets.");

  const assetNames = new Map((assetResult.data ?? []).map((asset) => [asset.id, asset.name]));
  const organizationNames = new Map((targetOrganizations.data ?? []).map((organization) => [organization.id, organization.display_name]));
  const targetsByCampaign = new Map<number, string[]>();
  for (const target of targetResult.data ?? []) {
    const name = organizationNames.get(target.organization_id);
    if (name) targetsByCampaign.set(target.campaign_id, [...(targetsByCampaign.get(target.campaign_id) ?? []), name]);
  }

  return {
    source: "supabase",
    canCreate,
    mediaOptions: (mediaResult.data ?? []).map((asset) => ({ id: asset.id, name: asset.name })),
    targetOptions: (directoryResult.data ?? []).map((organization) => ({ id: organization.id, name: organization.display_name, category: organization.category })),
    campaigns: (campaigns ?? []).map((campaign) => ({
      publicId: campaign.public_id,
      name: campaign.name,
      asset: assetNames.get(campaign.media_asset_id) ?? "Approved media",
      status: campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1),
      spent: Number(campaign.spent_credits),
      budget: Number(campaign.budget_credits),
      plays: 0,
      pace: campaign.status === "active" ? "Calculating" : campaign.status === "scheduled" ? "Not started" : campaign.status === "draft" ? "Draft plan" : "Paused",
      tone: statusTone(campaign.status),
      dates: formatDateRange(campaign.starts_at, campaign.ends_at),
      targets: targetsByCampaign.get(campaign.id) ?? [],
    })),
  };
}

export async function getCampaignCards() {
  const workspace = await getCampaignWorkspace();
  return { source: workspace.source, campaigns: workspace.campaigns };
}
