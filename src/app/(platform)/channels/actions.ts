"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";

export type ChannelActionState = { status: "idle" | "error" | "success"; message: string };

const channelSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(300),
});
const channelDisplaySchema = z.object({
  broadcastEnabled: z.boolean(),
  showLiveBadge: z.boolean(),
  showChannelName: z.boolean(),
  showNowPlaying: z.boolean(),
  showAudioControl: z.boolean(),
  showAdvertiserLogo: z.boolean(),
  showStripeBanner: z.boolean(),
  showVideoTime: z.boolean(),
  stripeBannerText: z.string().trim().max(240),
  stripeBannerPosition: z.enum(["top", "bottom"]),
  videoFit: z.enum(["contain", "cover"]),
});

async function requireAdmin() {
  const workspace = await getWorkspaceContext();
  return workspace.permissions.canAccessAdmin && workspace.membership.role === "admin";
}

function value(formData: FormData, key: string) {
  const candidate = formData.get(key);
  return typeof candidate === "string" ? candidate : "";
}

function displayValues(formData: FormData) {
  return channelDisplaySchema.safeParse({
    broadcastEnabled: formData.has("broadcast-enabled"),
    showLiveBadge: formData.has("show-live-badge"),
    showChannelName: formData.has("show-channel-name"),
    showNowPlaying: formData.has("show-now-playing"),
    showAudioControl: formData.has("show-audio-control"),
    showAdvertiserLogo: formData.has("show-advertiser-logo"),
    showStripeBanner: formData.has("show-stripe-banner"),
    showVideoTime: formData.has("show-video-time"),
    stripeBannerText: value(formData, "stripe-banner-text"),
    stripeBannerPosition: value(formData, "stripe-banner-position"),
    videoFit: value(formData, "video-fit"),
  });
}

function displayUpdate(settings: z.infer<typeof channelDisplaySchema>) {
  return {
    broadcast_enabled: settings.broadcastEnabled,
    show_live_badge: settings.showLiveBadge,
    show_channel_name: settings.showChannelName,
    show_now_playing: settings.showNowPlaying,
    show_audio_control: settings.showAudioControl,
    show_advertiser_logo: settings.showAdvertiserLogo,
    show_stripe_banner: settings.showStripeBanner,
    show_video_time: settings.showVideoTime,
    stripe_banner_text: settings.stripeBannerText || null,
    stripe_banner_position: settings.stripeBannerPosition,
    video_fit: settings.videoFit,
  };
}

export async function createChannel(_state: ChannelActionState, formData: FormData): Promise<ChannelActionState> {
  if (!await requireAdmin()) return { status: "error", message: "Platform administrator access is required." };
  const parsed = channelSchema.safeParse({ name: value(formData, "name"), description: value(formData, "description") });
  if (!parsed.success) return { status: "error", message: "Enter a channel name and an optional description." };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const suffix = crypto.randomUUID().slice(0, 8);
  const baseSlug = parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "channel";
  const { error } = await supabase.from("streaming_channels").insert({
    name: parsed.data.name,
    description: parsed.data.description || null,
    slug: `${baseSlug}-${suffix}`,
    status: "active",
    created_by: typeof claims?.claims?.sub === "string" ? claims.claims.sub : null,
  });
  if (error) return { status: "error", message: "The channel could not be created." };
  revalidatePath("/channels");
  return { status: "success", message: "Channel created." };
}

export async function updateChannel(_state: ChannelActionState, formData: FormData): Promise<ChannelActionState> {
  if (!await requireAdmin()) return { status: "error", message: "Platform administrator access is required." };
  const publicId = z.string().uuid().safeParse(value(formData, "channelPublicId"));
  const status = z.enum(["active", "paused"]).safeParse(value(formData, "status"));
  const parsed = channelSchema.safeParse({ name: value(formData, "name"), description: value(formData, "description") });
  const display = displayValues(formData);
  if (!publicId.success || !status.success || !parsed.success || !display.success) return { status: "error", message: "Review the channel details and stream display settings." };

  const supabase = await createClient();
  const { error } = await supabase.from("streaming_channels").update({ name: parsed.data.name, description: parsed.data.description || null, status: status.data, ...displayUpdate(display.data) }).eq("public_id", publicId.data);
  if (error) return { status: "error", message: "The channel could not be updated." };
  revalidatePath("/channels");
  return { status: "success", message: "Channel updated." };
}

export async function updateChannelDisplaySettings(_state: ChannelActionState, formData: FormData): Promise<ChannelActionState> {
  if (!await requireAdmin()) return { status: "error", message: "Platform administrator access is required." };
  const publicId = z.string().uuid().safeParse(value(formData, "channelPublicId"));
  const display = displayValues(formData);
  if (!publicId.success || !display.success) return { status: "error", message: "Review the stream display settings." };
  const supabase = await createClient();
  const { error } = await supabase.from("streaming_channels").update(displayUpdate(display.data)).eq("public_id", publicId.data);
  if (error) return { status: "error", message: "The stream display settings could not be saved." };
  revalidatePath("/channels");
  revalidatePath("/stream/[channelId]/[accessKey]", "page");
  return { status: "success", message: "Stream display settings updated." };
}

export async function deleteChannel(formData: FormData) {
  if (!await requireAdmin()) return;
  const publicId = z.string().uuid().safeParse(value(formData, "channelPublicId"));
  if (!publicId.success) return;
  const supabase = await createClient();
  const { error } = await supabase.from("streaming_channels").delete().eq("public_id", publicId.data);
  if (error) throw new Error("The channel could not be deleted.");
  revalidatePath("/channels");
}

export async function rotateChannelAccessKey(formData: FormData) {
  if (!await requireAdmin()) return;
  const publicId = z.string().uuid().safeParse(value(formData, "channelPublicId"));
  if (!publicId.success) return;
  const supabase = await createClient();
  const { error } = await supabase.from("streaming_channels").update({ access_key: crypto.randomUUID() }).eq("public_id", publicId.data);
  if (error) throw new Error("The stream link could not be rotated.");
  revalidatePath("/channels");
}

export async function setBusinessAssignment(formData: FormData) {
  if (!await requireAdmin()) return;
  const parsed = z.object({ channelId: z.coerce.number().int().positive(), organizationId: z.coerce.number().int().positive(), intent: z.enum(["assign", "remove"]) }).safeParse({
    channelId: value(formData, "channelId"), organizationId: value(formData, "organizationId"), intent: value(formData, "intent"),
  });
  if (!parsed.success) return;
  const supabase = await createClient();
  if (parsed.data.intent === "assign") {
    const { data: claims } = await supabase.auth.getClaims();
    const { error } = await supabase.from("streaming_channel_organizations").upsert({
      channel_id: parsed.data.channelId,
      organization_id: parsed.data.organizationId,
      assigned_by: typeof claims?.claims?.sub === "string" ? claims.claims.sub : null,
    });
    if (error) throw new Error("The business could not be assigned.");
  } else {
    const { error } = await supabase.from("streaming_channel_organizations").delete().eq("channel_id", parsed.data.channelId).eq("organization_id", parsed.data.organizationId);
    if (error) throw new Error("The business assignment could not be removed.");
  }
  revalidatePath("/channels");
}

export async function addChannelMedia(formData: FormData) {
  if (!await requireAdmin()) return;
  const parsed = z.object({ channelId: z.coerce.number().int().positive(), assetId: z.coerce.number().int().positive() }).safeParse({ channelId: value(formData, "channelId"), assetId: value(formData, "assetId") });
  if (!parsed.success) return;
  const supabase = await createClient();
  const [{ data: claims }, { data: lastItem }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.from("streaming_channel_items").select("position").eq("channel_id", parsed.data.channelId).order("position", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const { error } = await supabase.from("streaming_channel_items").insert({
    channel_id: parsed.data.channelId,
    media_asset_id: parsed.data.assetId,
    position: (lastItem?.position ?? 0) + 1,
    status: "active",
    created_by: typeof claims?.claims?.sub === "string" ? claims.claims.sub : null,
  });
  if (error) throw new Error("The media could not be added to this channel.");
  revalidatePath("/channels");
}

export async function removeChannelMedia(formData: FormData) {
  if (!await requireAdmin()) return;
  const itemId = z.coerce.number().int().positive().safeParse(value(formData, "itemId"));
  if (!itemId.success) return;
  const supabase = await createClient();
  const { error } = await supabase.from("streaming_channel_items").delete().eq("id", itemId.data);
  if (error) throw new Error("The media could not be removed from this channel.");
  revalidatePath("/channels");
}
