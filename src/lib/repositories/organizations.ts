import "server-only";

import { createClient } from "@/lib/supabase/server";

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
  owner: string;
  locationCount: number;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationAdminData = {
  source: "live" | "setup";
  pendingAccounts: PendingAccount[];
  organizations: OrganizationAdminRow[];
};

const setupErrorCodes = new Set(["PGRST205", "42501"]);

export async function getOrganizationAdminData(): Promise<OrganizationAdminData> {
  const supabase = await createClient();
  const [profilesResult, organizationsResult, membershipsResult, locationsResult] = await Promise.all([
    supabase.from("profiles").select("id,email,full_name,email_verified_at,account_status,platform_role,created_at").order("created_at", { ascending: true }),
    supabase.from("organizations").select("id,public_id,display_name,legal_name,category,status,created_at,updated_at").order("created_at", { ascending: false }),
    supabase.from("organization_memberships").select("organization_id,user_id,role,status").eq("role", "owner").eq("status", "active"),
    supabase.from("locations").select("id,organization_id"),
  ]);

  const error = profilesResult.error ?? organizationsResult.error ?? membershipsResult.error ?? locationsResult.error;
  if (error) {
    if (setupErrorCodes.has(error.code)) return { source: "setup", pendingAccounts: [], organizations: [] };
    throw new Error(`Unable to load organization administration: ${error.message}`);
  }

  const profiles = profilesResult.data ?? [];
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const ownerByOrganization = new Map((membershipsResult.data ?? []).map((membership) => [membership.organization_id, membership.user_id]));
  const locationCounts = new Map<number, number>();
  for (const location of locationsResult.data ?? []) {
    locationCounts.set(location.organization_id, (locationCounts.get(location.organization_id) ?? 0) + 1);
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
        owner: ownerProfile?.email ?? "Owner not assigned",
        locationCount: locationCounts.get(organization.id) ?? 0,
        createdAt: organization.created_at,
        updatedAt: organization.updated_at,
      };
    }),
  };
}
