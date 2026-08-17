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
  signal,
}: {
  client: SupabaseClient<Database>;
  file: File;
  storagePath: string;
  onProgress: (percent: number) => void;
  signal?: AbortSignal;
}) {
  const { data, error } = await client.auth.getSession();
  if (error || !data.session?.access_token) throw new Error("Your session expired. Sign in again before uploading.");
  const endpoint = resumableEndpoint();

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let highestProgress = 0;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", handleAbort);
      callback();
    };
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
      onProgress: (uploaded, total) => {
        highestProgress = Math.max(highestProgress, total > 0 ? Math.round((uploaded / total) * 100) : 0);
        onProgress(Math.min(100, highestProgress));
      },
      onError: (uploadError) => finish(() => reject(new Error(readableUploadError(uploadError)))),
      onSuccess: () => finish(resolve),
    });

    function handleAbort() {
      const finishAbort = () => {
        finish(() => reject(new DOMException("Upload cancelled.", "AbortError")));
      };
      void upload.abort(true).then(finishAbort, finishAbort);
    }

    if (signal?.aborted) {
      handleAbort();
      return;
    }
    signal?.addEventListener("abort", handleAbort, { once: true });

    void upload.findPreviousUploads().then((previousUploads) => {
      if (signal?.aborted) return;
      if (previousUploads[0]) upload.resumeFromPreviousUpload(previousUploads[0]);
      upload.start();
    }).catch((uploadError: unknown) => finish(() => reject(new Error(readableUploadError(uploadError)))));
  });
}

function readableUploadError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/401|403|unauthorized|forbidden/i.test(message)) return "Your upload permission expired. Sign in again and retry.";
  if (/413|maximum.*size|too large/i.test(message)) return "The video exceeds the 100 MB upload limit.";
  if (/409|already exists|conflict/i.test(message)) return "This upload path is already in use. Cancel this attempt and retry.";
  if (/network|fetch|offline|timeout|connection/i.test(message)) return "The network interrupted the upload after automatic retries. Check your connection and retry.";
  return "The video upload failed after automatic retries. You can retry without selecting the file again.";
}
