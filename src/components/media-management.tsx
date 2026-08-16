"use client";

import { CheckCircle2, CirclePlay, FileVideo, Link2, LoaderCircle, ShieldCheck, Upload, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { createYouTubeMedia, moderateMedia, prepareMediaUpload, submitMediaUpload, type MediaActionState } from "@/app/(platform)/media/actions";
import type { MediaLibraryItem } from "@/lib/repositories/media";
import { createClient } from "@/lib/supabase/client";
import { MEDIA_MAX_FILE_BYTES } from "@/lib/storage/media-storage";

const initialActionState: MediaActionState = { status: "idle", message: "" };
const targetDurations = [15, 30, 60];

type VideoInspection = { durationMs: number; width: number; height: number };

async function inspectVideo(file: File): Promise<VideoInspection> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<VideoInspection>((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => resolve({
        durationMs: Math.round(video.duration * 1000),
        width: video.videoWidth,
        height: video.videoHeight,
      });
      video.onerror = () => reject(new Error("The browser could not read this MP4 video."));
      video.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function sha256(file: File) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validateInspection(inspection: VideoInspection) {
  const seconds = inspection.durationMs / 1000;
  if (!targetDurations.some((target) => Math.abs(target - seconds) <= 1)) {
    return "Video duration must be 15, 30, or 60 seconds.";
  }
  const ratio = inspection.width / inspection.height;
  if (inspection.width < 1280 || inspection.height < 720 || Math.abs(ratio - 16 / 9) > 0.02) {
    return "Video must be landscape 16:9 at 1280 x 720 or higher.";
  }
  return null;
}

export function MediaUploadPanel({ organizations }: { organizations: Array<{ id: number; name: string }> }) {
  const router = useRouter();
  const [sourceType, setSourceType] = useState<"upload" | "youtube">("upload");
  const [status, setStatus] = useState<"idle" | "validating" | "uploading" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [youtubeState, youtubeAction, youtubePending] = useActionState(createYouTubeMedia, initialActionState);

  useEffect(() => {
    if (youtubeState.status === "success") router.refresh();
  }, [router, youtubeState]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const fileValue = formData.get("file");
    const file = fileValue instanceof File ? fileValue : null;
    const name = String(formData.get("name") ?? "").trim();
    const organizationId = Number(formData.get("organizationId"));
    const rightsDeclared = formData.get("rightsDeclared") === "on";

    if (!file || file.size < 1) {
      setStatus("error");
      setMessage("Choose an MP4 video to upload.");
      return;
    }
    const mimeType = file.type === "video/mp4" || file.name.toLowerCase().endsWith(".mp4") ? "video/mp4" : file.type;
    if (mimeType !== "video/mp4" || file.size > MEDIA_MAX_FILE_BYTES || !rightsDeclared || name.length < 2) {
      setStatus("error");
      setMessage("Check the media name, MP4 format, 100 MB limit, and rights declaration.");
      return;
    }

    try {
      setStatus("validating");
      setMessage("Checking playback format and creating an integrity checksum...");
      const [inspection, checksum] = await Promise.all([inspectVideo(file), sha256(file)]);
      const inspectionError = validateInspection(inspection);
      if (inspectionError) throw new Error(inspectionError);

      const prepared = await prepareMediaUpload({
        organizationId,
        name,
        originalFilename: file.name,
        mimeType,
        fileSizeBytes: file.size,
        rightsDeclared,
      });
      if (!prepared.ok) throw new Error(prepared.error);

      setStatus("uploading");
      setUploadProgress(0);
      setMessage("Uploading securely with automatic retry. Keep this page open until it finishes...");
      const supabase = createClient();
      const { uploadMediaResumable } = await import("@/lib/storage/media-upload-client");
      await uploadMediaResumable({ client: supabase, file, storagePath: prepared.storagePath, onProgress: setUploadProgress });

      setStatus("submitting");
      setMessage("Submitting the video for platform review...");
      const submission = await submitMediaUpload({
        assetPublicId: prepared.assetPublicId,
        durationMs: inspection.durationMs,
        width: inspection.width,
        height: inspection.height,
        checksumSha256: checksum,
        technicalMetadata: {
          source: "browser-preflight",
          durationSeconds: inspection.durationMs / 1000,
          width: inspection.width,
          height: inspection.height,
          browserCanPlay: true,
        },
      });
      if (submission.status === "error") throw new Error(submission.message);

      setStatus("success");
      setMessage(submission.message);
      form.reset();
      router.refresh();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "The upload could not be completed.");
    }
  }

  const busy = ["validating", "uploading", "submitting"].includes(status);
  return (
    <section className="panel media-upload-form">
      <div className="panel-header"><div><p className="eyebrow">Media source</p><h2>Add a new creative</h2><p>Upload a private MP4 or submit a YouTube video while keeping the same review and channel-assignment workflow.</p></div>{sourceType === "upload" ? <FileVideo size={22} /> : <CirclePlay size={22} />}</div>
      <div className="media-source-tabs" role="tablist" aria-label="Media source">
        <button type="button" role="tab" aria-selected={sourceType === "upload"} className={sourceType === "upload" ? "active" : ""} onClick={() => setSourceType("upload")}><Upload size={15} /> Upload video</button>
        <button type="button" role="tab" aria-selected={sourceType === "youtube"} className={sourceType === "youtube" ? "active" : ""} onClick={() => setSourceType("youtube")}><CirclePlay size={15} /> YouTube link</button>
      </div>
      {sourceType === "upload" ? <form className="media-upload-fields" onSubmit={handleSubmit} noValidate>
        {message ? <div className={`auth-message auth-message-${status === "error" ? "error" : "success"}`} role={status === "error" ? "alert" : "status"}>{status === "error" ? <XCircle size={17} /> : busy ? <LoaderCircle className="auth-spinner" size={17} /> : <CheckCircle2 size={17} />}<span>{message}</span></div> : null}
        {status === "uploading" ? <div className="media-upload-progress" role="progressbar" aria-label="Video upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploadProgress}><span style={{ width: `${uploadProgress}%` }} /><small>{uploadProgress}%</small></div> : null}
        <label><span>Advertiser business</span><select name="organizationId" defaultValue="" required disabled={busy}><option value="" disabled>Select business</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label>
        <label><span>Media name</span><input name="name" minLength={2} maxLength={120} placeholder="Summer lunch offer" required disabled={busy} /></label>
        <label className="media-file-field"><span>MP4 video</span><input name="file" type="file" accept="video/mp4,.mp4" required disabled={busy} /><small>15, 30, or 60 seconds / 16:9 / minimum 1280 x 720 / maximum 100 MB</small></label>
        <label className="media-rights"><input name="rightsDeclared" type="checkbox" required disabled={busy} /><span>I confirm that this business owns or has permission to use all video, music, logos, people, and claims in this advertisement.</span></label>
        <button className="button button-primary" type="submit" disabled={busy}>{busy ? <LoaderCircle className="auth-spinner" size={17} /> : <Upload size={17} />}{busy ? "Processing upload..." : "Upload and submit for review"}</button>
      </form> : <form className="media-upload-fields" action={youtubeAction}>
        {youtubeState.message ? <div className={`auth-message auth-message-${youtubeState.status}`} role={youtubeState.status === "error" ? "alert" : "status"}>{youtubeState.status === "error" ? <XCircle size={17} /> : <CheckCircle2 size={17} />}<span>{youtubeState.message}</span></div> : null}
        <label><span>Advertiser business</span><select name="organizationId" defaultValue="" required disabled={youtubePending}><option value="" disabled>Select business</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label>
        <label><span>Media name</span><input name="name" minLength={2} maxLength={120} placeholder="YouTube brand story" required disabled={youtubePending} /></label>
        <label><span>YouTube video URL</span><span className="input-with-icon"><Link2 size={15} /><input name="url" type="url" maxLength={500} placeholder="https://www.youtube.com/watch?v=..." required disabled={youtubePending} /></span><small>Supports YouTube watch, Shorts, embed, and youtu.be links. The video must allow embedding.</small></label>
        <label><span>Exact video duration in seconds</span><input name="durationSeconds" type="number" min={5} max={3600} step={1} placeholder="30" required disabled={youtubePending} /><small>Used to keep every viewer synchronized in the continuous channel loop.</small></label>
        <label className="media-rights"><input name="rightsDeclared" type="checkbox" required disabled={youtubePending} /><span>I confirm that this business owns or has permission to stream this YouTube video and all content contained in it.</span></label>
        <button className="button button-primary" type="submit" disabled={youtubePending}>{youtubePending ? <LoaderCircle className="auth-spinner" size={17} /> : <CirclePlay size={17} />}{youtubePending ? "Submitting..." : "Submit YouTube video for review"}</button>
      </form>}
    </section>
  );
}

export function MediaModerationPanel({ asset }: { asset: MediaLibraryItem }) {
  const [state, formAction, pending] = useActionState(moderateMedia, initialActionState);
  if (asset.rawStatus !== "in_review") return null;
  const processingReady = asset.processingStatus === "ready";
  return (
    <form className="media-moderation-form" action={formAction}>
      <input type="hidden" name="assetPublicId" value={asset.id} />
      {state.message ? <div className={`auth-message auth-message-${state.status}`}>{state.status === "success" ? <CheckCircle2 size={15} /> : <ShieldCheck size={15} />}<span>{state.message}</span></div> : null}
      <label><span>Moderation reason</span><textarea name="reason" minLength={5} maxLength={500} rows={2} required placeholder="Technical and policy review notes." /></label>
      {!processingReady ? <small>Approval becomes available after secure media processing finishes.</small> : null}
      <div><button className="button button-secondary" name="decision" value="rejected" type="submit" disabled={pending}><XCircle size={16} /> Reject</button><button className="button button-primary" name="decision" value="approved" type="submit" disabled={pending || !processingReady}><CheckCircle2 size={16} /> Approve</button></div>
    </form>
  );
}
