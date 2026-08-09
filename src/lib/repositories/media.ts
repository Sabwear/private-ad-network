import "server-only";

import { mediaAssets as demoMediaAssets, type StatusTone } from "@/lib/platform-data";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { createMediaReadUrl } from "@/lib/storage/media-storage";

export type MediaLibraryItem = {
  id: string;
  name: string;
  owner: string;
  status: string;
  rawStatus: string;
  tone: StatusTone;
  format: string;
  duration: string;
  updated: string;
  fileName: string;
  fileSize: string;
  rejectionReason: string;
  previewUrl: string | null;
};

export type MediaLibraryResult = {
  source: "demo" | "supabase" | "setup";
  assets: MediaLibraryItem[];
  summary: { total: number; inReview: number; approved: number; rejected: number };
};

const setupErrorCodes = new Set(["PGRST204", "PGRST205", "42501"]);

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function toneForStatus(status: string): StatusTone {
  if (status === "approved") return "success";
  if (["rejected", "archived"].includes(status)) return "danger";
  if (["in_review", "processing"].includes(status)) return "warning";
  return "neutral";
}

function fileSizeLabel(bytes: number | null) {
  if (!bytes) return "Not reported";
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes >= 10 ? megabytes.toFixed(0) : megabytes.toFixed(1)} MB`;
}

function durationLabel(milliseconds: number | null) {
  if (!milliseconds) return "--:--";
  const seconds = Math.round(milliseconds / 1000);
  return `0:${seconds.toString().padStart(2, "0")}`;
}

function summarize(assets: MediaLibraryItem[]) {
  return {
    total: assets.length,
    inReview: assets.filter((asset) => ["in_review", "processing"].includes(asset.rawStatus)).length,
    approved: assets.filter((asset) => asset.rawStatus === "approved").length,
    rejected: assets.filter((asset) => asset.rawStatus === "rejected").length,
  };
}

function demoResult(): MediaLibraryResult {
  const assets = demoMediaAssets.map((asset, index) => ({
    id: `demo-${index}`,
    name: asset.name,
    owner: asset.owner,
    status: asset.status,
    rawStatus: asset.status.toLowerCase().replaceAll(" ", "_"),
    tone: asset.tone,
    format: asset.format,
    duration: asset.duration,
    updated: asset.updated,
    fileName: "Preview data",
    fileSize: "--",
    rejectionReason: "",
    previewUrl: null,
  }));
  return { source: "demo", assets, summary: summarize(assets) };
}

export async function getMediaLibrary(): Promise<MediaLibraryResult> {
  if (!hasSupabaseEnv()) return demoResult();
  const supabase = await createClient();
  const [assetsResult, organizationsResult] = await Promise.all([
    supabase.from("media_assets").select("public_id,organization_id,name,original_storage_path,original_filename,mime_type,file_size_bytes,duration_ms,width,height,codec,moderation_status,rejection_reason,updated_at").order("created_at", { ascending: false }),
    supabase.from("organizations").select("id,display_name"),
  ]);

  const error = assetsResult.error ?? organizationsResult.error;
  if (error) {
    if (setupErrorCodes.has(error.code)) return { source: "setup", assets: [], summary: summarize([]) };
    throw new Error(`Unable to load media: ${error.message}`);
  }

  const organizationNames = new Map((organizationsResult.data ?? []).map((organization) => [organization.id, organization.display_name]));
  const assets = await Promise.all((assetsResult.data ?? []).map(async (asset): Promise<MediaLibraryItem> => {
    const previewUrl = asset.original_storage_path
      ? await createMediaReadUrl(supabase, asset.original_storage_path)
      : null;
    const dimensions = asset.width && asset.height ? `${asset.width} x ${asset.height}` : "Pending inspection";
    return {
      id: asset.public_id,
      name: asset.name,
      owner: organizationNames.get(asset.organization_id) ?? "Unknown organization",
      status: titleCase(asset.moderation_status),
      rawStatus: asset.moderation_status,
      tone: toneForStatus(asset.moderation_status),
      format: `${asset.mime_type ?? "MP4 pending"} / ${asset.codec ?? "codec pending"} / ${dimensions}`,
      duration: durationLabel(asset.duration_ms),
      updated: new Date(asset.updated_at).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" }),
      fileName: asset.original_filename ?? "Not reported",
      fileSize: fileSizeLabel(asset.file_size_bytes),
      rejectionReason: asset.rejection_reason ?? "",
      previewUrl,
    };
  }));

  return { source: "supabase", assets, summary: summarize(assets) };
}
