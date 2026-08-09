import "server-only";

import type { WorkspaceContext } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";

export type LocationOrganizationOption = { id: number; name: string };
export type LocationRow = {
  id: number;
  publicId: string;
  organizationId: number;
  organization: string;
  name: string;
  address: string;
  zone: string;
  category: string;
  trafficBand: string;
  status: string;
  operatingHours: string;
};

export type LocationManagementData = {
  source: "live" | "setup";
  organizations: LocationOrganizationOption[];
  locations: LocationRow[];
};

function operatingHoursLabel(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Not configured";
  const schedule = value as { days?: unknown; opens_at?: unknown; closes_at?: unknown };
  const days = Array.isArray(schedule.days) ? schedule.days.length : 0;
  if (typeof schedule.opens_at !== "string" || typeof schedule.closes_at !== "string") return "Not configured";
  return `${days} days · ${schedule.opens_at}–${schedule.closes_at}`;
}

export async function getLocationManagementData(workspace: WorkspaceContext): Promise<LocationManagementData> {
  const supabase = await createClient();
  let organizationsQuery = supabase.from("organizations").select("id,display_name").eq("status", "active").order("display_name");
  let locationsQuery = supabase.from("locations").select("id,public_id,organization_id,name,address,zone,category,traffic_band,status,operating_hours").order("created_at", { ascending: false });

  if (workspace.organization.id !== null) {
    organizationsQuery = organizationsQuery.eq("id", workspace.organization.id);
    locationsQuery = locationsQuery.eq("organization_id", workspace.organization.id);
  }

  const [organizationsResult, locationsResult] = await Promise.all([organizationsQuery, locationsQuery]);
  const error = organizationsResult.error ?? locationsResult.error;
  if (error) {
    if (error.code === "PGRST205" || error.code === "42501") return { source: "setup", organizations: [], locations: [] };
    throw new Error(`Unable to load locations: ${error.message}`);
  }

  const organizations = (organizationsResult.data ?? []).map((organization) => ({ id: organization.id, name: organization.display_name }));
  const organizationNames = new Map(organizations.map((organization) => [organization.id, organization.name]));

  return {
    source: "live",
    organizations,
    locations: (locationsResult.data ?? []).map((location) => ({
      id: location.id,
      publicId: location.public_id,
      organizationId: location.organization_id,
      organization: organizationNames.get(location.organization_id) ?? "Unknown organization",
      name: location.name,
      address: location.address ?? "—",
      zone: location.zone,
      category: location.category,
      trafficBand: location.traffic_band ?? "Not set",
      status: location.status,
      operatingHours: operatingHoursLabel(location.operating_hours),
    })),
  };
}
