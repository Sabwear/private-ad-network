"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { MEDIA_ALLOWED_MIME_TYPES, MEDIA_MAX_FILE_BYTES } from "@/lib/storage/media-storage";

export type MediaActionState = { status: "idle" | "error" | "success"; message: string };

export type PrepareMediaUploadResult =
  | { ok: true; assetPublicId: string; storagePath: string }
  | { ok: false; error: string };

const prepareSchema = z.object({
  name: z.string().trim().min(2).max(120),
  originalFilename: z.string().trim().min(1).max(255),
  mimeType: z.string().refine((value) => MEDIA_ALLOWED_MIME_TYPES.has(value)),
  fileSizeBytes: z.number().int().min(1).max(MEDIA_MAX_FILE_BYTES),
  rightsDeclared: z.literal(true),
});

const submissionSchema = z.object({
  assetPublicId: z.string().uuid(),
  durationMs: z.number().int().min(1_000).max(600_000),
  width: z.number().int().positive().max(16_384),
  height: z.number().int().positive().max(16_384),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
  technicalMetadata: z.record(z.string(), z.unknown()),
});

const moderationSchema = z.object({
  assetPublicId: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().trim().min(5).max(500),
});

export async function prepareMediaUpload(input: unknown): Promise<PrepareMediaUploadResult> {
  const workspace = await getWorkspaceContext();
  if (!workspace.permissions.canUploadMedia || !workspace.organization.id) {
    return { ok: false, error: "An active business workspace is required to upload media." };
  }

  const parsed = prepareSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the media name, file type, size, and rights declaration." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_media_upload", {
    p_organization_id: workspace.organization.id,
    p_name: parsed.data.name,
    p_original_filename: parsed.data.originalFilename,
    p_mime_type: parsed.data.mimeType,
    p_file_size_bytes: parsed.data.fileSizeBytes,
  });
  const upload = data?.[0];
  if (error || !upload) {
    return { ok: false, error: error?.code === "PGRST202" ? "Media upload setup is not deployed yet." : "A secure upload could not be prepared." };
  }

  return { ok: true, assetPublicId: upload.asset_public_id, storagePath: upload.storage_path };
}

export async function submitMediaUpload(input: unknown): Promise<MediaActionState> {
  const workspace = await getWorkspaceContext();
  if (!workspace.permissions.canUploadMedia) return { status: "error", message: "You do not have media submission access." };

  const parsed = submissionSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "The uploaded video metadata is invalid." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_media_upload", {
    p_asset_public_id: parsed.data.assetPublicId,
    p_duration_ms: parsed.data.durationMs,
    p_width: parsed.data.width,
    p_height: parsed.data.height,
    p_codec: "Browser-validated MP4",
    p_checksum_sha256: parsed.data.checksumSha256,
    p_technical_metadata: parsed.data.technicalMetadata as Json,
  });
  if (error) return { status: "error", message: "The file uploaded, but it could not be submitted for review." };

  revalidatePath("/media");
  return { status: "success", message: "Upload complete. The video is now waiting for moderation." };
}

export async function moderateMedia(
  _previousState: MediaActionState,
  formData: FormData,
): Promise<MediaActionState> {
  const workspace = await getWorkspaceContext();
  if (!workspace.permissions.canModerateMedia) return { status: "error", message: "Platform moderation access is required." };

  const parsed = moderationSchema.safeParse({
    assetPublicId: formData.get("assetPublicId"),
    decision: formData.get("decision"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { status: "error", message: "Enter a clear reason and choose approve or reject." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("moderate_media_asset", {
    p_asset_public_id: parsed.data.assetPublicId,
    p_decision: parsed.data.decision,
    p_reason: parsed.data.reason,
  });
  if (error) return { status: "error", message: "The moderation decision could not be recorded." };

  revalidatePath("/media");
  revalidatePath("/campaigns");
  return { status: "success", message: `Media ${parsed.data.decision}.` };
}
