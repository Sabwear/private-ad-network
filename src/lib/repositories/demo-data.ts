import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseAdminEnv } from "@/lib/supabase/config";

export type DemoDataSummary = {
  businesses: number;
  locations: number;
  screens: number;
  media: number;
  campaigns: number;
};

const emptySummary: DemoDataSummary = { businesses: 0, locations: 0, screens: 0, media: 0, campaigns: 0 };

export async function getDemoDataSummary(): Promise<DemoDataSummary> {
  if (!hasSupabaseAdminEnv()) return emptySummary;
  const admin = createAdminClient();
  const { data: organizations, error } = await admin.from("organizations").select("id").contains("billing_profile", { demo: true });
  if (error) throw new Error("Unable to inspect demo data.");
  const organizationIds = (organizations ?? []).map((organization) => organization.id);
  if (!organizationIds.length) return emptySummary;

  const [locationsResult, mediaResult, campaignResult] = await Promise.all([
    admin.from("locations").select("id", { count: "exact" }).in("organization_id", organizationIds),
    admin.from("media_assets").select("id", { count: "exact", head: true }).in("organization_id", organizationIds),
    admin.from("campaigns").select("id", { count: "exact", head: true }).in("organization_id", organizationIds),
  ]);
  const dataError = locationsResult.error ?? mediaResult.error ?? campaignResult.error;
  if (dataError) throw new Error("Unable to inspect demo records.");
  const locationIds = (locationsResult.data ?? []).map((location) => location.id);
  const screensResult = locationIds.length
    ? await admin.from("devices").select("id", { count: "exact", head: true }).in("location_id", locationIds)
    : { count: 0, error: null };
  if (screensResult.error) throw new Error("Unable to inspect demo screens.");

  return {
    businesses: organizationIds.length,
    locations: locationIds.length,
    screens: screensResult.count ?? 0,
    media: mediaResult.count ?? 0,
    campaigns: campaignResult.count ?? 0,
  };
}
