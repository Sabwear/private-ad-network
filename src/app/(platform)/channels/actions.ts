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
const streamAddressSchema = z.object({
  slug: z.string().trim().toLowerCase().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  customHostname: z.string().trim().toLowerCase().max(253).refine((hostname) => !hostname || /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(hostname)),
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
  showFullscreenControl: z.boolean(),
  showLeaveControl: z.boolean(),
  showViewerLogin: z.boolean(),
  showChannelDescription: z.boolean(),
  showProgressBar: z.boolean(),
  stripeBannerText: z.string().trim().max(240),
  stripeBannerPosition: z.enum(["top", "bottom"]),
  videoFit: z.enum(["contain", "cover"]),
  overlayPosition: z.enum(["top", "bottom"]),
  overlayStyle: z.enum(["gradient", "glass", "minimal"]),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

async function requireAdmin() {
  const workspace = await getWorkspaceContext();
  return workspace.permissions.canAccessAdmin && workspace.account.role === "admin";
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
    showFullscreenControl: formData.has("show-fullscreen-control"),
    showLeaveControl: formData.has("show-leave-control"),
    showViewerLogin: formData.has("show-viewer-login"),
    showChannelDescription: formData.has("show-channel-description"),
    showProgressBar: formData.has("show-progress-bar"),
    stripeBannerText: value(formData, "stripe-banner-text"),
    stripeBannerPosition: value(formData, "stripe-banner-position"),
    videoFit: value(formData, "video-fit"),
    overlayPosition: value(formData, "overlay-position"),
    overlayStyle: value(formData, "overlay-style"),
    accentColor: value(formData, "accent-color"),
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
    show_fullscreen_control: settings.showFullscreenControl,
    show_leave_control: settings.showLeaveControl,
    show_viewer_login: settings.showViewerLogin,
    show_channel_description: settings.showChannelDescription,
    show_progress_bar: settings.showProgressBar,
    stripe_banner_text: settings.stripeBannerText || null,
    stripe_banner_position: settings.stripeBannerPosition,
    video_fit: settings.videoFit,
    overlay_position: settings.overlayPosition,
    overlay_style: settings.overlayStyle,
    accent_color: settings.accentColor.toLowerCase(),
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
  revalidatePath("/operations");
  return { status: "success", message: "Channel created." };
}

export async function updateChannel(_state: ChannelActionState, formData: FormData): Promise<ChannelActionState> {
  if (!await requireAdmin()) return { status: "error", message: "Platform administrator access is required." };
  const publicId = z.string().uuid().safeParse(value(formData, "channelPublicId"));
  const status = z.enum(["active", "paused"]).safeParse(value(formData, "status"));
  const parsed = channelSchema.safeParse({ name: value(formData, "name"), description: value(formData, "description") });
  const address = streamAddressSchema.safeParse({ slug: value(formData, "slug"), customHostname: value(formData, "customHostname") });
  if (!publicId.success || !status.success || !parsed.success || !address.success) return { status: "error", message: "Review the channel details and stream address." };

  const supabase = await createClient();
  const { error } = await supabase.from("streaming_channels").update({ name: parsed.data.name, slug: address.data.slug, custom_hostname: address.data.customHostname || null, description: parsed.data.description || null, status: status.data }).eq("public_id", publicId.data);
  if (error) return { status: "error", message: error.code === "23505" ? "That stream path or hostname is already assigned to another channel." : "The channel could not be updated." };
  revalidatePath("/operations");
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
  revalidatePath("/operations");
  revalidatePath("/watch/[slug]", "page");
  revalidatePath("/stream/[channelId]/[accessKey]", "page");
  return { status: "success", message: "Video settings updated." };
}

export async function deleteChannel(formData: FormData) {
  if (!await requireAdmin()) return;
  const publicId = z.string().uuid().safeParse(value(formData, "channelPublicId"));
  if (!publicId.success) return;
  const supabase = await createClient();
  const { error } = await supabase.from("streaming_channels").delete().eq("public_id", publicId.data);
  if (error) throw new Error("The channel could not be deleted.");
  revalidatePath("/operations");
}

export async function rotateChannelAccessKey(formData: FormData) {
  if (!await requireAdmin()) return;
  const publicId = z.string().uuid().safeParse(value(formData, "channelPublicId"));
  if (!publicId.success) return;
  const supabase = await createClient();
  const { error } = await supabase.from("streaming_channels").update({ access_key: crypto.randomUUID() }).eq("public_id", publicId.data);
  if (error) throw new Error("The stream link could not be rotated.");
  revalidatePath("/operations");
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
  revalidatePath("/operations");
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
  revalidatePath("/operations");
}

export async function removeChannelMedia(formData: FormData) {
  if (!await requireAdmin()) return;
  const itemId = z.coerce.number().int().positive().safeParse(value(formData, "itemId"));
  if (!itemId.success) return;
  const supabase = await createClient();
  const { error } = await supabase.from("streaming_channel_items").delete().eq("id", itemId.data);
  if (error) throw new Error("The media could not be removed from this channel.");
  revalidatePath("/operations");
}
