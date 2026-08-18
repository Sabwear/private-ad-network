"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";

export type CampaignActionState = { status: "idle" | "error" | "success"; message: string };

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const campaignSchema = z.object({
  organizationId: z.coerce.number().int().positive(),
  name: z.string().trim().min(3).max(120),
  mediaAssetId: z.coerce.number().int().positive(),
  startsOn: z.string().regex(datePattern),
  endsOn: z.string().regex(datePattern),
  budgetCredits: z.coerce.number().min(1).max(1_000_000_000),
  targetLocationIds: z.array(z.coerce.number().int().positive()).min(1).max(100),
});

function value(formData: FormData, key: string) {
  const candidate = formData.get(key);
  return typeof candidate === "string" ? candidate : "";
}

export async function publishCampaign(_state: CampaignActionState, formData: FormData): Promise<CampaignActionState> {
  const workspace = await getWorkspaceContext();
  if (workspace.mode !== "active" || !workspace.permissions.canAccessAdmin) return { status: "error", message: "Platform administrator access is required." };

  const parsed = campaignSchema.safeParse({
    organizationId: value(formData, "organizationId"),
    name: value(formData, "name"),
    mediaAssetId: value(formData, "mediaAssetId"),
    startsOn: value(formData, "startsOn"),
    endsOn: value(formData, "endsOn"),
    budgetCredits: value(formData, "budgetCredits"),
    targetLocationIds: formData.getAll("targetLocationIds"),
  });
  if (!parsed.success) return { status: "error", message: "Add a campaign name, approved media, valid dates, budget, and at least one delivery location." };

  const startsAt = new Date(`${parsed.data.startsOn}T00:00:00.000Z`);
  const endsAt = new Date(`${parsed.data.endsOn}T23:59:59.999Z`);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (startsAt < today || endsAt <= startsAt) return { status: "error", message: "Choose a start date from today onward and an end date after it." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_and_publish_campaign", {
    p_organization_id: parsed.data.organizationId,
    p_name: parsed.data.name,
    p_media_asset_id: parsed.data.mediaAssetId,
    p_starts_at: startsAt.toISOString(),
    p_ends_at: endsAt.toISOString(),
    p_budget_credits: parsed.data.budgetCredits,
    p_target_location_ids: [...new Set(parsed.data.targetLocationIds)],
  });
  if (error) return { status: "error", message: error.message || "The campaign could not be published." };

  revalidatePath("/campaigns");
  revalidatePath("/overview");
  return { status: "success", message: "Campaign published and ready for delivery." };
}

export async function updateAndPublishCampaign(_state: CampaignActionState, formData: FormData): Promise<CampaignActionState> {
  const workspace = await getWorkspaceContext();
  if (workspace.mode !== "active" || !workspace.permissions.canAccessAdmin) return { status: "error", message: "Platform administrator access is required." };

  const publicId = z.string().uuid().safeParse(value(formData, "campaignPublicId"));
  const parsed = campaignSchema.safeParse({
    organizationId: value(formData, "organizationId"),
    name: value(formData, "name"),
    mediaAssetId: value(formData, "mediaAssetId"),
    startsOn: value(formData, "startsOn"),
    endsOn: value(formData, "endsOn"),
    budgetCredits: value(formData, "budgetCredits"),
    targetLocationIds: formData.getAll("targetLocationIds"),
  });
  if (!publicId.success || !parsed.success) return { status: "error", message: "Add a campaign name, approved media, valid dates, budget, and at least one delivery location." };

  const startsAt = new Date(`${parsed.data.startsOn}T00:00:00.000Z`);
  const endsAt = new Date(`${parsed.data.endsOn}T23:59:59.999Z`);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (startsAt < today || endsAt <= startsAt) return { status: "error", message: "Choose a start date from today onward and an end date after it." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_and_publish_campaign", {
    p_campaign_public_id: publicId.data,
    p_name: parsed.data.name,
    p_media_asset_id: parsed.data.mediaAssetId,
    p_starts_at: startsAt.toISOString(),
    p_ends_at: endsAt.toISOString(),
    p_budget_credits: parsed.data.budgetCredits,
    p_target_location_ids: [...new Set(parsed.data.targetLocationIds)],
  });
  if (error) return { status: "error", message: error.message || "The campaign could not be published." };

  revalidatePath("/campaigns");
  revalidatePath("/overview");
  return { status: "success", message: "Campaign published and ready for delivery." };
}

export async function deleteCampaignDraft(formData: FormData) {
  const workspace = await getWorkspaceContext();
  if (!workspace.permissions.canAccessAdmin) return;
  const publicId = z.string().uuid().safeParse(value(formData, "campaignPublicId"));
  if (!publicId.success) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_campaign_draft", { p_campaign_public_id: publicId.data });
  if (error) throw new Error("The campaign draft could not be deleted.");
  revalidatePath("/campaigns");
  revalidatePath("/overview");
}
