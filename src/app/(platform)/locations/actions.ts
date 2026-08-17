"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";

export type LocationActionState = {
  status: "idle" | "error" | "success";
  message: string;
  fieldErrors?: Partial<Record<"organizationId" | "name" | "address" | "zone" | "category" | "trafficBand" | "days" | "opensAt" | "closesAt", string>>;
};

export type LocationUpdateActionState = {
  status: "idle" | "error" | "success";
  message: string;
  fieldErrors?: Partial<Record<"name" | "address" | "zone" | "category" | "trafficBand" | "days" | "opensAt" | "closesAt" | "categoryExclusions" | "locationStatus" | "reason", string>>;
};

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const locationSchema = z.object({
  organizationId: z.coerce.number().int().positive("Select an organization."),
  name: z.string().trim().min(2, "Enter a location name.").max(120),
  address: z.string().trim().max(240),
  zone: z.string().trim().min(2, "Enter the service zone or neighborhood.").max(100),
  category: z.string().trim().min(2, "Select a location category.").max(80),
  trafficBand: z.enum(["low", "medium", "high"]),
  days: z.array(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])).min(1, "Select at least one operating day."),
  opensAt: z.string().regex(timePattern, "Enter a valid opening time."),
  closesAt: z.string().regex(timePattern, "Enter a valid closing time."),
}).refine((value) => value.opensAt < value.closesAt, {
  path: ["closesAt"],
  message: "Closing time must be after opening time.",
});

const locationUpdateSchema = locationSchema.extend({
  locationId: z.coerce.number().int().positive(),
  categoryExclusions: z.array(z.enum(["adult", "alcohol", "cryptocurrency", "gambling", "healthcare", "political", "tobacco"])).max(20),
  locationStatus: z.enum(["active", "suspended"]),
  reason: z.string().trim().min(5, "Record a reason for this change.").max(300),
});

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function errorsFrom(error: z.ZodError): LocationActionState["fieldErrors"] {
  const errors: NonNullable<LocationActionState["fieldErrors"]> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !errors[field as keyof typeof errors]) {
      errors[field as keyof typeof errors] = issue.message;
    }
  }
  return errors;
}

export async function createLocation(
  _previousState: LocationActionState,
  formData: FormData,
): Promise<LocationActionState> {
  const workspace = await getWorkspaceContext();
  if (!workspace.permissions.canManageLocations) {
    return { status: "error", message: "You do not have permission to manage locations." };
  }

  const parsed = locationSchema.safeParse({
    organizationId: stringField(formData, "organizationId"),
    name: stringField(formData, "name"),
    address: stringField(formData, "address"),
    zone: stringField(formData, "zone"),
    category: stringField(formData, "category"),
    trafficBand: stringField(formData, "trafficBand"),
    days: formData.getAll("days").filter((day): day is string => typeof day === "string"),
    opensAt: stringField(formData, "opensAt"),
    closesAt: stringField(formData, "closesAt"),
  });

  if (!parsed.success) {
    return { status: "error", message: "Check the highlighted fields and try again.", fieldErrors: errorsFrom(parsed.error) };
  }

  if (workspace.organization.id !== null && parsed.data.organizationId !== workspace.organization.id) {
    return { status: "error", message: "You can only add locations to your own organization." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_location", {
    p_organization_id: parsed.data.organizationId,
    p_name: parsed.data.name,
    p_address: parsed.data.address,
    p_zone: parsed.data.zone,
    p_category: parsed.data.category,
    p_traffic_band: parsed.data.trafficBand,
    p_operating_hours: {
      days: parsed.data.days,
      opens_at: parsed.data.opensAt,
      closes_at: parsed.data.closesAt,
      timezone: "Africa/Casablanca",
    },
  });

  if (error) {
    return {
      status: "error",
      message: error.code === "PGRST202" || error.code === "PGRST205"
        ? "Location management is not available until the database migration is deployed."
        : error.code === "23505"
          ? "A location with that name already exists in this organization."
        : "The location could not be created. Please try again.",
    };
  }

  revalidatePath("/campaigns");
  revalidatePath("/admin");
  return { status: "success", message: "Location created and activated." };
}

export async function updateLocation(
  _previousState: LocationUpdateActionState,
  formData: FormData,
): Promise<LocationUpdateActionState> {
  const workspace = await getWorkspaceContext();
  if (!workspace.permissions.canManageLocations) {
    return { status: "error", message: "You do not have permission to manage locations." };
  }

  const parsed = locationUpdateSchema.safeParse({
    locationId: stringField(formData, "locationId"),
    organizationId: stringField(formData, "organizationId"),
    name: stringField(formData, "name"),
    address: stringField(formData, "address"),
    zone: stringField(formData, "zone"),
    category: stringField(formData, "category"),
    trafficBand: stringField(formData, "trafficBand"),
    days: formData.getAll("days").filter((day): day is string => typeof day === "string"),
    opensAt: stringField(formData, "opensAt"),
    closesAt: stringField(formData, "closesAt"),
    categoryExclusions: formData.getAll("categoryExclusions").filter((value): value is string => typeof value === "string"),
    locationStatus: stringField(formData, "locationStatus"),
    reason: stringField(formData, "reason"),
  });

  if (!parsed.success) {
    const errors: NonNullable<LocationUpdateActionState["fieldErrors"]> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && !errors[field as keyof typeof errors]) {
        errors[field as keyof typeof errors] = issue.message;
      }
    }
    return { status: "error", message: "Check the highlighted fields and try again.", fieldErrors: errors };
  }

  if (workspace.organization.id !== null && parsed.data.organizationId !== workspace.organization.id) {
    return { status: "error", message: "You can only update locations in your own organization." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_location", {
    p_location_id: parsed.data.locationId,
    p_organization_id: parsed.data.organizationId,
    p_name: parsed.data.name,
    p_address: parsed.data.address,
    p_zone: parsed.data.zone,
    p_category: parsed.data.category,
    p_traffic_band: parsed.data.trafficBand,
    p_operating_hours: {
      days: parsed.data.days,
      opens_at: parsed.data.opensAt,
      closes_at: parsed.data.closesAt,
      timezone: "Africa/Casablanca",
    },
    p_category_exclusions: parsed.data.categoryExclusions,
    p_status: parsed.data.locationStatus,
    p_reason: parsed.data.reason,
  });

  if (error) {
    return {
      status: "error",
      message: error.code === "PGRST202"
        ? "Location editing is unavailable until the latest database migration is deployed."
        : error.code === "23505"
          ? "A location with that name already exists in this organization."
          : "The location could not be updated. Refresh and try again.",
    };
  }

  revalidatePath("/campaigns");
  revalidatePath("/admin");
  return { status: "success", message: "Location details and eligibility controls updated." };
}
