import "server-only";

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
  operatingDays: string[];
  opensAt: string;
  closesAt: string;
  categoryExclusions: string[];
  updatedAt: string;
};

export type LocationManagementData = {
  source: "live" | "setup";
  organizations: LocationOrganizationOption[];
  locations: LocationRow[];
};

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function operatingHoursDetails(value: unknown) {
  const fallback = { label: "Not configured", days: [] as string[], opensAt: "09:00", closesAt: "18:00" };
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;

  const schedule = value as { days?: unknown; opens_at?: unknown; closes_at?: unknown };
  const days = stringArray(schedule.days);
  if (typeof schedule.opens_at !== "string" || typeof schedule.closes_at !== "string") return fallback;

  return {
    label: `${days.length} days · ${schedule.opens_at}–${schedule.closes_at}`,
    days,
    opensAt: schedule.opens_at,
    closesAt: schedule.closes_at,
  };
}

export async function getLocationManagementData(): Promise<LocationManagementData> {
  const supabase = await createClient();
  const organizationsQuery = supabase.from("organizations").select("id,display_name").eq("status", "active").order("display_name");
  const locationsQuery = supabase
    .from("locations")
    .select("id,public_id,organization_id,name,address,zone,category,traffic_band,status,operating_hours,category_exclusions,updated_at")
    .order("created_at", { ascending: false });

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
    locations: (locationsResult.data ?? []).map((location) => {
      const operatingHours = operatingHoursDetails(location.operating_hours);
      return {
        id: location.id,
        publicId: location.public_id,
        organizationId: location.organization_id,
        organization: organizationNames.get(location.organization_id) ?? "Unknown organization",
        name: location.name,
        address: location.address ?? "—",
        zone: location.zone,
        category: location.category,
        trafficBand: location.traffic_band ?? "medium",
        status: location.status,
        operatingHours: operatingHours.label,
        operatingDays: operatingHours.days,
        opensAt: operatingHours.opensAt,
        closesAt: operatingHours.closesAt,
        categoryExclusions: stringArray(location.category_exclusions),
        updatedAt: location.updated_at,
      };
    }),
  };
}
