import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createMediaReadUrl } from "@/lib/storage/media-storage";
import { PORTAL_MEDIA_URL_TTL_SECONDS } from "@/lib/storage/media-playback";

const assetIdSchema = z.string().uuid();

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: { code: status === 401 ? "AUTHENTICATION_REQUIRED" : "MEDIA_NOT_FOUND", message } },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ assetId: string }> },
) {
  const { assetId } = await context.params;
  if (!assetIdSchema.safeParse(assetId).success) {
    return errorResponse("The requested media is unavailable.", 404);
  }

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims?.sub) {
    return errorResponse("Sign in to view this media.", 401);
  }

  const { data: asset, error: assetError } = await supabase
    .from("media_assets")
    .select("original_storage_path,normalized_storage_path,processing_status")
    .eq("public_id", assetId)
    .maybeSingle();

  if (assetError || !asset?.original_storage_path) {
    return errorResponse("The requested media is unavailable.", 404);
  }

  const playbackPath = asset.processing_status === "ready" && asset.normalized_storage_path
    ? asset.normalized_storage_path
    : asset.original_storage_path;
  const signedUrl = await createMediaReadUrl(
    supabase,
    playbackPath,
    PORTAL_MEDIA_URL_TTL_SECONDS,
  );
  if (!signedUrl) {
    return errorResponse("The requested media is unavailable.", 404);
  }

  const response = NextResponse.redirect(signedUrl, 307);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}
