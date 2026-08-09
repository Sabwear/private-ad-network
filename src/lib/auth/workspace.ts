import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type WorkspaceRole =
  | "owner"
  | "staff"
  | "moderator"
  | "operations"
  | "finance"
  | "admin";

export type WorkspaceContext = {
  mode: "active" | "setup";
  user: { email: string; initials: string };
  organization: { id: number | null; name: string; publicId: string | null; status: string };
  membership: { role: WorkspaceRole; label: string };
  permissions: {
    canAccessAdmin: boolean;
    canProvisionOrganizations: boolean;
    canManageOrganization: boolean;
    canManageLocations: boolean;
    canManageFinance: boolean;
  };
  notice: string | null;
};

const roleLabels: Record<WorkspaceRole, string> = {
  owner: "Business owner",
  staff: "Team member",
  moderator: "Content moderator",
  operations: "Network operations",
  finance: "Finance operator",
  admin: "Platform administrator",
};

function initials(value: string) {
  const localPart = value.split("@")[0] ?? value;
  const parts = localPart.split(/[._\-\s]+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "AD";
}

function permissionsFor(role: WorkspaceRole) {
  return {
    canAccessAdmin: ["moderator", "operations", "finance", "admin"].includes(role),
    canProvisionOrganizations: role === "admin",
    canManageOrganization: ["owner", "admin"].includes(role),
    canManageLocations: ["owner", "staff", "admin"].includes(role),
    canManageFinance: ["owner", "finance", "admin"].includes(role),
  };
}

function setupWorkspace(email: string, notice: string): WorkspaceContext {
  return {
    mode: "setup",
    user: { email, initials: initials(email) },
    organization: { id: null, name: "Workspace setup", publicId: null, status: "pending" },
    membership: { role: "staff", label: "Pending onboarding" },
    permissions: {
      canAccessAdmin: false,
      canProvisionOrganizations: false,
      canManageOrganization: false,
      canManageLocations: false,
      canManageFinance: false,
    },
    notice,
  };
}

export const getWorkspaceContext = cache(async (): Promise<WorkspaceContext> => {
  if (!hasSupabaseEnv()) redirect("/login?message=service-unavailable");

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;

  if (claimsError || !claims?.sub) redirect("/login");

  const email = typeof claims.email === "string" ? claims.email : "Signed-in account";
  const { data: profile } = await supabase
    .from("profiles")
    .select("platform_role,account_status")
    .eq("id", claims.sub)
    .maybeSingle();

  if (profile?.platform_role === "admin" && profile.account_status === "active") {
    return {
      mode: "active",
      user: { email, initials: initials(email) },
      organization: { id: null, name: "Network administration", publicId: null, status: "active" },
      membership: { role: "admin", label: roleLabels.admin },
      permissions: permissionsFor("admin"),
      notice: null,
    };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("organization_memberships")
    .select("organization_id,role,status")
    .eq("user_id", claims.sub)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    return setupWorkspace(
      email,
      "The workspace data service is not ready. Ask a network administrator to complete platform setup.",
    );
  }

  if (!membership) {
    return setupWorkspace(
      email,
      "Your account is ready. A network administrator must create your business organization and assign you as its owner.",
    );
  }

  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .select("public_id,display_name,status")
    .eq("id", membership.organization_id)
    .single();

  if (organizationError || !organization) {
    return setupWorkspace(email, "Your organization could not be loaded. Ask a network administrator to review your membership.");
  }

  const role = membership.role as WorkspaceRole;
  return {
    mode: "active",
    user: { email, initials: initials(email) },
    organization: {
      id: membership.organization_id,
      name: organization.display_name,
      publicId: organization.public_id,
      status: organization.status,
    },
    membership: { role, label: roleLabels[role] },
    permissions: permissionsFor(role),
    notice: organization.status === "active" ? null : `Organization status: ${organization.status}.`,
  };
});
