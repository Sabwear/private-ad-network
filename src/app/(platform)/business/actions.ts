"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";
import { BUSINESS_LOGO_BUCKET } from "@/lib/storage/business-logo";

export type OrganizationActionState = {
  status: "idle" | "error" | "success";
  message: string;
  fieldErrors?: Partial<Record<"displayName" | "legalName" | "category" | "reason", string>>;
};

export type OrganizationUpdateActionState = {
  status: "idle" | "error" | "success";
  message: string;
  fieldErrors?: Partial<Record<"displayName" | "legalName" | "category" | "organizationStatus" | "websiteUrl" | "contactEmail" | "contactPhone" | "logoPosition" | "logoSizePercent" | "operatingStartDate" | "operatingEndDate" | "operatingDays" | "operatingOpensAt" | "operatingClosesAt" | "operatingTimeZone" | "reason", string>>;
};
export type BusinessAdActionState = { status: "idle" | "error" | "success"; message: string };
export type StreamCreditActionState = { status: "idle" | "error" | "success"; message: string };
export type BusyHoursActionState = { status: "idle" | "error" | "success"; message: string };

const organizationSchema = z.object({
  displayName: z.string().trim().min(2, "Enter the business display name.").max(120),
  legalName: z.string().trim().max(160),
  category: z.string().trim().min(2, "Select a business category.").max(80),
  reason: z.string().trim().min(5, "Record why this business is being created.").max(300),
});

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

const organizationUpdateSchema = z.object({
  organizationId: z.coerce.number().int().positive(),
  displayName: z.string().trim().min(2, "Enter the business display name.").max(120),
  legalName: z.string().trim().max(160),
  category: z.enum(["cafe", "restaurant", "retail", "fitness", "healthcare", "hospitality", "professional-services", "other"]),
  organizationStatus: z.enum(["active", "suspended"]),
  websiteUrl: z.union([z.literal(""), z.string().url("Enter a complete website URL including https://.").max(500)]),
  contactEmail: z.union([z.literal(""), z.string().email("Enter a valid contact email.").max(254)]),
  contactPhone: z.string().trim().max(40),
  logoPosition: z.enum(["top-left", "top-right", "bottom-left", "bottom-right"]),
  logoSizePercent: z.coerce.number().int().min(6).max(32),
  operatingStartDate: z.union([z.literal(""), z.string().regex(datePattern, "Enter a valid start date.")]),
  operatingEndDate: z.union([z.literal(""), z.string().regex(datePattern, "Enter a valid end date.")]),
  operatingDays: z.array(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])).min(1, "Select at least one working day."),
  operatingOpensAt: z.string().regex(timePattern, "Enter a valid opening time."),
  operatingClosesAt: z.string().regex(timePattern, "Enter a valid closing time."),
  operatingTimeZone: z.enum(["Africa/Casablanca", "UTC", "Europe/London", "Europe/Paris", "America/New_York"]),
  reason: z.string().trim().min(5, "Record a reason for this change.").max(300),
}).refine((value) => !value.operatingStartDate || !value.operatingEndDate || value.operatingEndDate >= value.operatingStartDate, { path: ["operatingEndDate"], message: "End date must be on or after the start date." })
  .refine((value) => value.operatingClosesAt > value.operatingOpensAt, { path: ["operatingClosesAt"], message: "Closing time must be after opening time." });

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
    reason: stringField(formData, "reason"),
  });

  if (!parsed.success) {
    return { status: "error", message: "Check the highlighted fields and try again.", fieldErrors: fieldErrors(parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_create_business", {
    p_display_name: parsed.data.displayName,
    p_legal_name: parsed.data.legalName,
    p_category: parsed.data.category,
    p_reason: parsed.data.reason,
  });

  if (error) {
    const setupMissing = error.code === "PGRST202" || error.code === "PGRST205";
    return {
      status: "error",
      message: setupMissing
        ? "Business provisioning is not available until the database migration is deployed."
        : "The business could not be created. Please review the details and try again.",
    };
  }

  revalidatePath("/business");
  revalidatePath("/campaigns");
  return { status: "success", message: "Business created under central administrator management." };
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
    websiteUrl: stringField(formData, "websiteUrl"),
    contactEmail: stringField(formData, "contactEmail"),
    contactPhone: stringField(formData, "contactPhone"),
    logoPosition: stringField(formData, "logoPosition"),
    logoSizePercent: stringField(formData, "logoSizePercent"),
    operatingStartDate: stringField(formData, "operatingStartDate"),
    operatingEndDate: stringField(formData, "operatingEndDate"),
    operatingDays: formData.getAll("operatingDays"),
    operatingOpensAt: stringField(formData, "operatingOpensAt"),
    operatingClosesAt: stringField(formData, "operatingClosesAt"),
    operatingTimeZone: stringField(formData, "operatingTimeZone"),
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
  const { error } = await supabase.rpc("admin_update_business_profile", {
    p_organization_id: parsed.data.organizationId,
    p_display_name: parsed.data.displayName,
    p_legal_name: parsed.data.legalName,
    p_category: parsed.data.category,
    p_status: parsed.data.organizationStatus,
    p_website_url: parsed.data.websiteUrl,
    p_contact_email: parsed.data.contactEmail,
    p_contact_phone: parsed.data.contactPhone,
    p_logo_position: parsed.data.logoPosition,
    p_logo_size_percent: parsed.data.logoSizePercent,
    p_operating_start_date: parsed.data.operatingStartDate || null,
    p_operating_end_date: parsed.data.operatingEndDate || null,
    p_operating_days: parsed.data.operatingDays,
    p_operating_opens_at: parsed.data.operatingOpensAt,
    p_operating_closes_at: parsed.data.operatingClosesAt,
    p_operating_time_zone: parsed.data.operatingTimeZone,
    p_reason: parsed.data.reason,
  });

  if (error) {
    return {
      status: "error",
      message: error.code === "PGRST202"
        ? "Business schedule editing is unavailable until the latest database migration is deployed."
        : "The business could not be updated. Refresh and try again.",
    };
  }

  revalidatePath("/business");
  revalidatePath("/campaigns");
  revalidatePath("/operations");
  return { status: "success", message: "Business profile, working dates, and hours updated." };
}

export async function saveOrganizationLogo(formData: FormData): Promise<{ status: "error" | "success"; message: string }> {
  const workspace = await getWorkspaceContext();
  if (!workspace.permissions.canProvisionOrganizations) return { status: "error", message: "Platform administrator access is required." };
  const parsed = z.object({ organizationId: z.coerce.number().int().positive(), logoStoragePath: z.union([z.literal(""), z.string().min(10).max(500)]) }).safeParse({
    organizationId: stringField(formData, "organizationId"),
    logoStoragePath: stringField(formData, "logoStoragePath"),
  });
  if (!parsed.success) return { status: "error", message: "The logo request is invalid." };

  const supabase = await createClient();
  const { data: previousPath, error } = await supabase.rpc("admin_set_organization_logo", {
    p_organization_id: parsed.data.organizationId,
    p_logo_storage_path: parsed.data.logoStoragePath || null,
  });
  if (error) return { status: "error", message: "The business logo could not be saved." };
  if (previousPath && previousPath !== parsed.data.logoStoragePath) {
    await supabase.storage.from(BUSINESS_LOGO_BUCKET).remove([previousPath]);
  }
  revalidatePath("/business");
  revalidatePath("/operations");
  return { status: "success", message: parsed.data.logoStoragePath ? "Business logo updated." : "Business logo removed." };
}

export async function assignBusinessAdToChannel(_state: BusinessAdActionState, formData: FormData): Promise<BusinessAdActionState> {
  const workspace = await getWorkspaceContext();
  if (!workspace.permissions.canProvisionOrganizations) return { status: "error", message: "Platform administrator access is required." };
  const parsed = z.object({ organizationId: z.coerce.number().int().positive(), channelId: z.coerce.number().int().positive(), assetId: z.coerce.number().int().positive() }).safeParse({
    organizationId: stringField(formData, "organizationId"),
    channelId: stringField(formData, "channelId"),
    assetId: stringField(formData, "assetId"),
  });
  if (!parsed.success) return { status: "error", message: "Choose an approved ad and a channel." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_assign_business_ad_to_channel", {
    p_organization_id: parsed.data.organizationId,
    p_channel_id: parsed.data.channelId,
    p_media_asset_id: parsed.data.assetId,
  });
  if (error) return { status: "error", message: "The ad could not be assigned. Confirm it is approved and fully processed." };
  revalidatePath("/business");
  revalidatePath("/operations");
  return { status: "success", message: "Ad assigned to the channel." };
}

export async function removeBusinessAdFromChannel(formData: FormData) {
  const workspace = await getWorkspaceContext();
  if (!workspace.permissions.canProvisionOrganizations) return;
  const parsed = z.object({ organizationId: z.coerce.number().int().positive(), itemId: z.coerce.number().int().positive() }).safeParse({
    organizationId: stringField(formData, "organizationId"),
    itemId: stringField(formData, "itemId"),
  });
  if (!parsed.success) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_remove_business_ad_from_channel", {
    p_organization_id: parsed.data.organizationId,
    p_channel_item_id: parsed.data.itemId,
  });
  if (error) throw new Error("The channel assignment could not be removed.");
  revalidatePath("/business");
  revalidatePath("/operations");
}

export async function updateBusinessStreamSettings(
  _state: StreamCreditActionState,
  formData: FormData,
): Promise<StreamCreditActionState> {
  const workspace = await getWorkspaceContext();
  const parsed = z.object({
    organizationId: z.coerce.number().int().positive(),
    earningEnabled: z.enum(["on", "off"]),
    earningRate: z.coerce.number().min(0).max(100000),
    consumptionRate: z.coerce.number().min(0).max(100000),
  }).safeParse({
    organizationId: stringField(formData, "organizationId"),
    earningEnabled: formData.get("earningEnabled") === "on" ? "on" : "off",
    earningRate: stringField(formData, "earningRate"),
    consumptionRate: stringField(formData, "consumptionRate"),
  });
  if (!parsed.success) return { status: "error", message: "Enter valid non-negative credit rates." };
  if (!workspace.permissions.canProvisionOrganizations) return { status: "error", message: "Platform administrator access is required." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_stream_credit_settings", {
    p_organization_id: parsed.data.organizationId,
    p_earning_enabled: parsed.data.earningEnabled === "on",
    p_earning_rate: parsed.data.earningRate,
    p_consumption_rate: parsed.data.consumptionRate,
  });
  if (error) return { status: "error", message: error.code === "PGRST202" ? "Deploy the viewer-credit migration first." : "The stream credit settings could not be saved." };
  revalidatePath("/business");
  revalidatePath("/profile");
  return { status: "success", message: "Stream credit settings updated." };
}

export async function updateBusinessBusyPeriods(
  _state: BusyHoursActionState,
  formData: FormData,
): Promise<BusyHoursActionState> {
  const workspace = await getWorkspaceContext();
  if (!workspace.permissions.canProvisionOrganizations) return { status: "error", message: "Platform administrator access is required." };

  const parsedBase = z.object({
    organizationId: z.coerce.number().int().positive(),
    periods: z.string().max(20_000),
    reason: z.string().trim().min(5).max(300),
  }).safeParse({
    organizationId: stringField(formData, "organizationId"),
    periods: stringField(formData, "periods"),
    reason: stringField(formData, "reason"),
  });
  if (!parsedBase.success) return { status: "error", message: "Check the busy periods and change reason." };

  const rawPeriods: unknown = (() => { try { return JSON.parse(parsedBase.data.periods); } catch { return null; } })();
  const periodSchema = z.object({
    day: z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]),
    start: z.string().regex(timePattern),
    end: z.string().regex(timePattern),
    multiplier: z.coerce.number().gt(1).max(10),
  }).refine((period) => period.end > period.start, { message: "End time must follow start time." });
  const periodsResult = z.array(periodSchema).max(50).safeParse(rawPeriods);
  if (!periodsResult.success) return { status: "error", message: "Busy periods need valid days, times, and multipliers from 1.01× to 10×." };

  const sorted = [...periodsResult.data].sort((a, b) => a.day.localeCompare(b.day) || a.start.localeCompare(b.start));
  if (sorted.some((period, index) => index > 0 && sorted[index - 1].day === period.day && sorted[index - 1].end > period.start)) {
    return { status: "error", message: "Busy periods on the same day cannot overlap." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_replace_business_busy_periods", {
    p_organization_id: parsedBase.data.organizationId,
    p_periods: periodsResult.data,
    p_reason: parsedBase.data.reason,
  });
  if (error) return { status: "error", message: error.code === "PGRST202" ? "Deploy the busy-hours migration first." : error.message };
  revalidatePath("/business");
  revalidatePath("/monitor");
  return { status: "success", message: "Busy-hour credit multipliers updated." };
}

export async function regenerateBusinessStreamCode(
  _state: StreamCreditActionState,
  formData: FormData,
): Promise<StreamCreditActionState> {
  const workspace = await getWorkspaceContext();
  const organizationId = Number(stringField(formData, "organizationId"));
  if (!Number.isInteger(organizationId) || organizationId <= 0 || !workspace.permissions.canProvisionOrganizations) {
    return { status: "error", message: "Platform administrator access is required." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("regenerate_stream_access_code", { p_organization_id: organizationId });
  if (error) return { status: "error", message: "A new access code could not be generated." };
  revalidatePath("/business");
  revalidatePath("/profile");
  return { status: "success", message: "A new six-digit stream code is now active." };
}
