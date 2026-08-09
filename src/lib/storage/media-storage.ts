import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export const MEDIA_BUCKET = "media";
export const MEDIA_MAX_FILE_BYTES = 100 * 1024 * 1024;
export const MEDIA_ALLOWED_MIME_TYPES = new Set(["video/mp4"]);

export async function createMediaReadUrl(
  client: SupabaseClient<Database>,
  storagePath: string,
  expiresInSeconds = 15 * 60,
) {
  const { data, error } = await client.storage.from(MEDIA_BUCKET).createSignedUrl(storagePath, expiresInSeconds);
  if (error) return null;
  return data.signedUrl;
}
