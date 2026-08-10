"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";

export type CampaignActionState = { status: "idle" | "error" | "success"; message: string };

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const campaignSchema = z.object({
  name: z.string().trim().min(3).max(120),
  mediaAssetId: z.coerce.number().int().positive(),
  startsOn: z.string().regex(datePattern),
  endsOn: z.string().regex(datePattern),
  budgetCredits: z.coerce.number().min(1).max(1_000_000_000),
  dailyCapCredits: z.union([z.literal(""), z.coerce.number().min(1).max(1_000_000_000)]),
  frequencyCapPerDay: z.union([z.literal(""), z.coerce.number().int().min(1).max(100)]),
  targetOrganizationIds: z.array(z.coerce.number().int().positive()).min(1).max(50),
});

function value(formData: FormData, key: string) {
  const candidate = formData.get(key);
  return typeof candidate === "string" ? candidate : "";
}

export async function createCampaignDraft(_state: CampaignActionState, formData: FormData): Promise<CampaignActionState> {
  const workspace = await getWorkspaceContext();
  if (workspace.mode !== "active" || workspace.organization.id === null || !["owner", "staff"].includes(workspace.membership.role)) {
    return { status: "error", message: "An active business owner or team member is required." };
  }

  const parsed = campaignSchema.safeParse({
    name: value(formData, "name"),
    mediaAssetId: value(formData, "mediaAssetId"),
    startsOn: value(formData, "startsOn"),
    endsOn: value(formData, "endsOn"),
    budgetCredits: value(formData, "budgetCredits"),
    dailyCapCredits: value(formData, "dailyCapCredits"),
    frequencyCapPerDay: value(formData, "frequencyCapPerDay"),
    targetOrganizationIds: formData.getAll("targetOrganizationIds"),
  });
  if (!parsed.success) return { status: "error", message: "Review the campaign name, approved media, dates, limits, and at least one target business." };

  const startsAt = new Date(`${parsed.data.startsOn}T00:00:00.000Z`);
  const endsAt = new Date(`${parsed.data.endsOn}T23:59:59.999Z`);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (startsAt < today || endsAt <= startsAt) return { status: "error", message: "Choose a start date from today onward and an end date after it." };
  const dailyCap = parsed.data.dailyCapCredits === "" ? null : parsed.data.dailyCapCredits;
  if (dailyCap !== null && dailyCap > parsed.data.budgetCredits) return { status: "error", message: "The daily cap cannot exceed the total budget." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_campaign_draft", {
    p_name: parsed.data.name,
    p_media_asset_id: parsed.data.mediaAssetId,
    p_starts_at: startsAt.toISOString(),
    p_ends_at: endsAt.toISOString(),
    p_budget_credits: parsed.data.budgetCredits,
    p_daily_cap_credits: dailyCap,
    p_frequency_cap_per_day: parsed.data.frequencyCapPerDay === "" ? null : parsed.data.frequencyCapPerDay,
    p_target_organization_ids: [...new Set(parsed.data.targetOrganizationIds)],
  });
  if (error) return { status: "error", message: "The draft could not be created. Confirm that the media is approved and each target business is active." };

  revalidatePath("/campaigns");
  revalidatePath("/overview");
  return { status: "success", message: "Campaign draft created. Activation stays locked until credit holds are enabled." };
}

export async function deleteCampaignDraft(formData: FormData) {
  const workspace = await getWorkspaceContext();
  if (workspace.organization.id === null || !["owner", "staff"].includes(workspace.membership.role)) return;
  const publicId = z.string().uuid().safeParse(value(formData, "campaignPublicId"));
  if (!publicId.success) return;
  const supabase = await createClient();
  const { error } = await supabase.from("campaigns").delete().eq("public_id", publicId.data).eq("organization_id", workspace.organization.id).eq("status", "draft");
  if (error) throw new Error("The campaign draft could not be deleted.");
  revalidatePath("/campaigns");
  revalidatePath("/overview");
}
