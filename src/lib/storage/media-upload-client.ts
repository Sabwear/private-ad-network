"use client";

import { Upload } from "tus-js-client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { MEDIA_BUCKET } from "@/lib/storage/media-storage";

function resumableEndpoint() {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configuredUrl) throw new Error("Media storage is unavailable.");
  const url = new URL(configuredUrl);
  if (url.hostname.endsWith(".supabase.co")) {
    const projectRef = url.hostname.split(".")[0];
    return `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`;
  }
  return `${url.origin}/storage/v1/upload/resumable`;
}

export async function uploadMediaResumable({
  client,
  file,
  storagePath,
  onProgress,
}: {
  client: SupabaseClient<Database>;
  file: File;
  storagePath: string;
  onProgress: (percent: number) => void;
}) {
  const { data, error } = await client.auth.getSession();
  if (error || !data.session?.access_token) throw new Error("Your session expired. Sign in again before uploading.");
  const endpoint = resumableEndpoint();

  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint,
      retryDelays: [0, 3_000, 5_000, 10_000, 20_000],
      headers: { authorization: `Bearer ${data.session.access_token}` },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      fingerprint: async () => `${endpoint}-${MEDIA_BUCKET}-${storagePath}-${file.name}-${file.size}-${file.lastModified}`,
      metadata: {
        bucketName: MEDIA_BUCKET,
        objectName: storagePath,
        contentType: "video/mp4",
        cacheControl: "3600",
      },
      onProgress: (uploaded, total) => onProgress(total > 0 ? Math.round((uploaded / total) * 100) : 0),
      onError: (uploadError) => reject(uploadError),
      onSuccess: () => resolve(),
    });

    void upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads[0]) upload.resumeFromPreviousUpload(previousUploads[0]);
      upload.start();
    }).catch(reject);
  });
}
