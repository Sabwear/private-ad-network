"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";

export type OrganizationActionState = {
  status: "idle" | "error" | "success";
  message: string;
  fieldErrors?: Partial<Record<"displayName" | "legalName" | "category" | "ownerUserId" | "reason", string>>;
};

export type OrganizationUpdateActionState = {
  status: "idle" | "error" | "success";
  message: string;
  fieldErrors?: Partial<Record<"displayName" | "legalName" | "category" | "organizationStatus" | "reason", string>>;
};

const organizationSchema = z.object({
  displayName: z.string().trim().min(2, "Enter the business display name.").max(120),
  legalName: z.string().trim().max(160),
  category: z.string().trim().min(2, "Select a business category.").max(80),
  ownerUserId: z.string().uuid("Select a valid owner account."),
  reason: z.string().trim().min(5, "Record why this organization is being created.").max(300),
});

const organizationUpdateSchema = z.object({
  organizationId: z.coerce.number().int().positive(),
  displayName: z.string().trim().min(2, "Enter the business display name.").max(120),
  legalName: z.string().trim().max(160),
  category: z.enum(["cafe", "restaurant", "retail", "fitness", "healthcare", "hospitality", "professional-services", "other"]),
  organizationStatus: z.enum(["active", "suspended"]),
  reason: z.string().trim().min(5, "Record a reason for this change.").max(300),
});

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function fieldErrors(error: z.ZodError): OrganizationActionState["fieldErrors"] {
  const errors: NonNullable<OrganizationActionState["fieldErrors"]> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !errors[field as keyof typeof errors]) {
      errors[field as keyof typeof errors] = issue.message;
    }
  }
  return errors;
}

export async function createOrganization(
  _previousState: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  const workspace = await getWorkspaceContext();
  if (!workspace.permissions.canProvisionOrganizations) {
    return { status: "error", message: "Platform administrator access is required." };
  }

  const parsed = organizationSchema.safeParse({
    displayName: stringField(formData, "displayName"),
    legalName: stringField(formData, "legalName"),
    category: stringField(formData, "category"),
    ownerUserId: stringField(formData, "ownerUserId"),
    reason: stringField(formData, "reason"),
  });

  if (!parsed.success) {
    return { status: "error", message: "Check the highlighted fields and try again.", fieldErrors: fieldErrors(parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_create_organization", {
    p_display_name: parsed.data.displayName,
    p_legal_name: parsed.data.legalName,
    p_category: parsed.data.category,
    p_owner_user_id: parsed.data.ownerUserId,
    p_reason: parsed.data.reason,
  });

  if (error) {
    const setupMissing = error.code === "PGRST202" || error.code === "PGRST205";
    const ownerUnavailable = error.code === "23505" || error.code === "23514";
    return {
      status: "error",
      message: setupMissing
        ? "Organization provisioning is not available until the database migration is deployed."
        : ownerUnavailable
          ? "That account is no longer available for assignment. Refresh and choose another account."
          : "The organization could not be created. Please review the details and try again.",
    };
  }

  revalidatePath("/business");
  revalidatePath("/locations");
  return { status: "success", message: "Organization created and owner access activated." };
}

export async function updateOrganization(
  _previousState: OrganizationUpdateActionState,
  formData: FormData,
): Promise<OrganizationUpdateActionState> {
  const workspace = await getWorkspaceContext();
  if (!workspace.permissions.canProvisionOrganizations) {
    return { status: "error", message: "Platform administrator access is required." };
  }

  const parsed = organizationUpdateSchema.safeParse({
    organizationId: stringField(formData, "organizationId"),
    displayName: stringField(formData, "displayName"),
    legalName: stringField(formData, "legalName"),
    category: stringField(formData, "category"),
    organizationStatus: stringField(formData, "organizationStatus"),
    reason: stringField(formData, "reason"),
  });

  if (!parsed.success) {
    const errors: NonNullable<OrganizationUpdateActionState["fieldErrors"]> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && !errors[field as keyof typeof errors]) {
        errors[field as keyof typeof errors] = issue.message;
      }
    }
    return { status: "error", message: "Check the highlighted fields and try again.", fieldErrors: errors };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_organization", {
    p_organization_id: parsed.data.organizationId,
    p_display_name: parsed.data.displayName,
    p_legal_name: parsed.data.legalName,
    p_category: parsed.data.category,
    p_status: parsed.data.organizationStatus,
    p_reason: parsed.data.reason,
  });

  if (error) {
    return {
      status: "error",
      message: error.code === "PGRST202"
        ? "Organization editing is unavailable until the latest database migration is deployed."
        : "The organization could not be updated. Refresh and try again.",
    };
  }

  revalidatePath("/business");
  revalidatePath("/locations");
  return { status: "success", message: "Organization details and access status updated." };
}
