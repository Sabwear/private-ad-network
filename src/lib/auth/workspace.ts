import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type WorkspaceRole = "admin" | "viewer";

export type WorkspaceContext = {
  mode: "active" | "setup";
  user: { email: string; initials: string };
  organization: { id: null; name: string; publicId: null; status: string };
  account: { role: WorkspaceRole; label: string };
  permissions: {
    canAccessAdmin: boolean;
    canProvisionOrganizations: boolean;
    canManageOrganization: boolean;
    canManageLocations: boolean;
    canManageDevices: boolean;
    canUploadMedia: boolean;
    canModerateMedia: boolean;
    canManageFinance: boolean;
  };
  notice: string | null;
};

const noPermissions = {
  canAccessAdmin: false,
  canProvisionOrganizations: false,
  canManageOrganization: false,
  canManageLocations: false,
  canManageDevices: false,
  canUploadMedia: false,
  canModerateMedia: false,
  canManageFinance: false,
};

const administratorPermissions = {
  canAccessAdmin: true,
  canProvisionOrganizations: true,
  canManageOrganization: true,
  canManageLocations: true,
  canManageDevices: true,
  canUploadMedia: true,
  canModerateMedia: true,
  canManageFinance: true,
};

function initials(value: string) {
  const localPart = value.split("@")[0] ?? value;
  const parts = localPart.split(/[._\-\s]+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "AD";
}

function restrictedWorkspace(email: string): WorkspaceContext {
  return {
    mode: "setup",
    user: { email, initials: initials(email) },
    organization: { id: null, name: "Viewer account", publicId: null, status: "restricted" },
    account: { role: "viewer", label: "Approved viewer" },
    permissions: noPermissions,
    notice: "This account can watch registered streams but cannot access the administrator dashboard.",
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

  if (profile?.platform_role !== "admin" || profile.account_status !== "active") return restrictedWorkspace(email);

  return {
    mode: "active",
    user: { email, initials: initials(email) },
    organization: { id: null, name: "Platform administration", publicId: null, status: "active" },
    account: { role: "admin", label: "Platform administrator" },
    permissions: administratorPermissions,
    notice: null,
  };
});
