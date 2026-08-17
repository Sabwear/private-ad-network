"use client";

import { CheckCircle2, CirclePlay, FileVideo, Link2, LoaderCircle, Maximize2, Pause, Play, ShieldCheck, Trash2, Upload, Volume2, VolumeX, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { cancelMediaUpload, createYouTubeMedia, deleteMediaAsset, moderateMedia, prepareMediaUpload, submitMediaUpload, type DeleteMediaState, type MediaActionState } from "@/app/(platform)/media/actions";
import type { MediaLibraryItem } from "@/lib/repositories/media";
import { createClient } from "@/lib/supabase/client";
import { MEDIA_BUCKET, MEDIA_MAX_FILE_BYTES } from "@/lib/storage/media-storage";

const initialActionState: MediaActionState = { status: "idle", message: "" };
const initialDeleteState: DeleteMediaState = { status: "idle", message: "" };
type VideoInspection = { durationMs: number; width: number; height: number };
type PendingUpload = {
  key: string;
  assetPublicId: string;
  storagePath: string;
  inspection: VideoInspection;
  checksum: string;
  compressVideo: boolean;
  uploaded: boolean;
};

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
  if (inspection.durationMs < 1_000) return "Video must contain at least one second of playable content.";
  const ratio = inspection.width / inspection.height;
  if (inspection.width < 1280 || inspection.height < 720 || Math.abs(ratio - 16 / 9) > 0.02) {
    return "Video must be landscape 16:9 at 1280 x 720 or higher.";
  }
  return null;
}

function mediaNameFromFilename(filename: string) {
  return filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

export function MediaPreviewControls({ source, title, youtube = false }: { source: string; title: string; youtube?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(false);

  function sendYouTubeCommand(command: "playVideo" | "pauseVideo" | "mute" | "unMute") {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: command, args: [] }), "https://www.youtube.com");
  }

  async function togglePlayback() {
    if (youtube) {
      sendYouTubeCommand(paused ? "playVideo" : "pauseVideo");
      setPaused((current) => !current);
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) await video.play();
    else video.pause();
  }

  function toggleMuted() {
    const nextMuted = !muted;
    if (youtube) sendYouTubeCommand(nextMuted ? "mute" : "unMute");
    else if (videoRef.current) videoRef.current.muted = nextMuted;
    setMuted(nextMuted);
  }

  async function openFullscreen() {
    await containerRef.current?.requestFullscreen();
  }

  return <div className="media-player" ref={containerRef}>
    {youtube
      ? <iframe ref={iframeRef} className="media-video media-youtube-preview" src={`${source}${source.includes("?") ? "&" : "?"}enablejsapi=1`} title={`Preview ${title}`} loading="lazy" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowFullScreen />
      : <video ref={videoRef} className="media-video" controls controlsList="nodownload" preload="metadata" src={source} aria-label={`Preview ${title}`} onPlay={() => setPaused(false)} onPause={() => setPaused(true)} onVolumeChange={(event) => setMuted(event.currentTarget.muted)} />}
    <div className="media-player-controls" aria-label={`Playback controls for ${title}`}>
      <button type="button" onClick={() => void togglePlayback()} aria-label={paused ? `Play ${title}` : `Pause ${title}`} title={paused ? "Play" : "Pause"}>{paused ? <Play size={15} fill="currentColor" /> : <Pause size={15} fill="currentColor" />}</button>
      <button type="button" onClick={toggleMuted} aria-label={muted ? `Unmute ${title}` : `Mute ${title}`} title={muted ? "Unmute" : "Mute"}>{muted ? <VolumeX size={15} /> : <Volume2 size={15} />}</button>
      <button type="button" onClick={() => void openFullscreen()} aria-label={`Open ${title} fullscreen`} title="Fullscreen"><Maximize2 size={15} /></button>
    </div>
  </div>;
}

export function MediaDeleteControl({ assetPublicId, name }: { assetPublicId: string; name: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(deleteMediaAsset, initialDeleteState);
  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [router, state.status]);

  return <div className="media-delete-control">
    {state.message ? <p className={`form-status-${state.status}`}>{state.message}</p> : null}
    <form action={action} onSubmit={(event) => {
      if (!window.confirm(`Permanently delete “${name}” and all of its stored video files? This cannot be undone.`)) event.preventDefault();
    }}>
      <input type="hidden" name="assetPublicId" value={assetPublicId} />
      <button className="button button-danger" type="submit" disabled={pending}>{pending ? <LoaderCircle className="auth-spinner" size={15} /> : <Trash2 size={15} />}{pending ? "Deleting..." : "Delete media"}</button>
    </form>
  </div>;
}

export function MediaUploadPanel({ organizations, autoApproves = false }: { organizations: Array<{ id: number; name: string }>; autoApproves?: boolean }) {
  const router = useRouter();
  const [sourceType, setSourceType] = useState<"upload" | "youtube">("upload");
  const [status, setStatus] = useState<"idle" | "validating" | "uploading" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [mediaName, setMediaName] = useState("");
  const [mediaNameEdited, setMediaNameEdited] = useState(false);
  const [pendingPhase, setPendingPhase] = useState<"uploading" | "uploaded" | null>(null);
  const pendingUpload = useRef<PendingUpload | null>(null);
  const uploadController = useRef<AbortController | null>(null);
  const activeUpload = useRef<Promise<void> | null>(null);
  const cancelling = useRef(false);
  const [youtubeState, youtubeAction, youtubePending] = useActionState(createYouTubeMedia, initialActionState);

  useEffect(() => {
    if (youtubeState.status === "success") router.refresh();
  }, [router, youtubeState]);

  useEffect(() => () => uploadController.current?.abort(), []);

  async function clearPendingUpload(attempt: PendingUpload) {
    const supabase = createClient();
    const { error } = await supabase.storage.from(MEDIA_BUCKET).remove([attempt.storagePath]);
    if (error && !/not found/i.test(error.message)) return false;
    const cancelled = await cancelMediaUpload(attempt.assetPublicId);
    if (cancelled.ok && pendingUpload.current?.assetPublicId === attempt.assetPublicId) {
      pendingUpload.current = null;
      setPendingPhase(null);
    }
    return cancelled.ok;
  }

  async function handleCancel() {
    cancelling.current = true;
    uploadController.current?.abort();
    await activeUpload.current?.catch(() => undefined);
    const attempt = pendingUpload.current;
    setStatus("validating");
    setMessage("Cancelling and clearing the unfinished upload...");
    if (attempt && !(await clearPendingUpload(attempt))) {
      setStatus("error");
      setMessage("The upload stopped, but its draft record could not be cleared. You can safely retry or remove it later.");
      cancelling.current = false;
      return;
    }
    setUploadProgress(0);
    setStatus("idle");
    setMessage("Upload cancelled.");
    cancelling.current = false;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const fileValue = formData.get("file");
    const file = fileValue instanceof File ? fileValue : null;
    const name = String(formData.get("name") ?? "").trim();
    const organizationId = Number(formData.get("organizationId"));
    const rightsDeclared = formData.get("rightsDeclared") === "on";
    const compressVideo = formData.get("compressVideo") === "on";

    if (!file || file.size < 1) {
      setStatus("error");
      setMessage("Choose an MP4 video to upload.");
      return;
    }
    const mimeType = file.type === "video/mp4" || file.name.toLowerCase().endsWith(".mp4") ? "video/mp4" : file.type;
    if (mimeType !== "video/mp4" || file.size > MEDIA_MAX_FILE_BYTES || file.name.length > 255 || !rightsDeclared || name.length < 2 || name.length > 120 || !Number.isInteger(organizationId) || organizationId < 1) {
      setStatus("error");
      setMessage("Check the media name, MP4 format, 100 MB limit, and rights declaration.");
      return;
    }

    try {
      const attemptKey = [file.name, file.size, file.lastModified, name, organizationId, compressVideo].join(":");
      let attempt = pendingUpload.current?.key === attemptKey ? pendingUpload.current : null;
      if (!attempt) {
        if (pendingUpload.current && !(await clearPendingUpload(pendingUpload.current))) {
          throw new Error("The previous unfinished upload could not be cleared. Cancel it before starting a different file.");
        }
        setStatus("validating");
        setUploadProgress(3);
        setMessage("Checking playback format...");
        const inspection = await inspectVideo(file);
        const inspectionError = validateInspection(inspection);
        if (inspectionError) throw new Error(inspectionError);
        setUploadProgress(7);
        setMessage("Creating an integrity checksum...");
        const checksum = await sha256(file);
        setUploadProgress(10);
        const prepared = await prepareMediaUpload({
          organizationId,
          name,
          originalFilename: file.name,
          mimeType,
          fileSizeBytes: file.size,
          rightsDeclared,
        });
        if (!prepared.ok) throw new Error(prepared.error);
        attempt = { key: attemptKey, ...prepared, inspection, checksum, compressVideo, uploaded: false };
        pendingUpload.current = attempt;
        setPendingPhase("uploading");
      }

      if (!attempt.uploaded) {
        setStatus("uploading");
        setUploadProgress(10);
        setMessage("Uploading securely with automatic retry. Keep this page open until it finishes...");
        const supabase = createClient();
        const controller = new AbortController();
        uploadController.current = controller;
        const { uploadMediaResumable } = await import("@/lib/storage/media-upload-client");
        const uploadPromise = uploadMediaResumable({ client: supabase, file, storagePath: attempt.storagePath, onProgress: (percent) => setUploadProgress(10 + Math.round(percent * 0.85)), signal: controller.signal });
        activeUpload.current = uploadPromise;
        await uploadPromise;
        attempt.uploaded = true;
        setPendingPhase("uploaded");
        uploadController.current = null;
        activeUpload.current = null;
      }

      setStatus("submitting");
      setUploadProgress(98);
      setMessage(autoApproves ? "Verifying the stored file and starting video processing..." : "Verifying the stored file and submitting it for platform review...");
      const submission = await submitMediaUpload({
        assetPublicId: attempt.assetPublicId,
        durationMs: attempt.inspection.durationMs,
        width: attempt.inspection.width,
        height: attempt.inspection.height,
        checksumSha256: attempt.checksum,
        compressVideo: attempt.compressVideo,
        technicalMetadata: {
          source: "browser-preflight",
          durationSeconds: attempt.inspection.durationMs / 1000,
          width: attempt.inspection.width,
          height: attempt.inspection.height,
          browserCanPlay: true,
        },
      });
      if (submission.status === "error") throw new Error(submission.message);

      setStatus("success");
      setUploadProgress(100);
      setMessage(submission.message);
      pendingUpload.current = null;
      setPendingPhase(null);
      form.reset();
      setMediaName("");
      setMediaNameEdited(false);
      router.refresh();
    } catch (error) {
      uploadController.current = null;
      activeUpload.current = null;
      if (cancelling.current) return;
      setStatus("error");
      setMessage(error instanceof DOMException && error.name === "AbortError" ? "Upload cancelled." : error instanceof Error ? error.message : "The upload could not be completed.");
    }
  }

  const busy = ["validating", "uploading", "submitting"].includes(status);
  return (
    <section className="panel media-upload-form">
      <div className="panel-header"><div><p className="eyebrow">Media source</p><h2>Add a new creative</h2><p>{autoApproves ? "Add a private MP4 or YouTube video. Administrator media becomes available automatically after technical processing." : "Upload a private MP4 or submit a YouTube video while keeping the same review and channel-assignment workflow."}</p></div>{sourceType === "upload" ? <FileVideo size={22} /> : <CirclePlay size={22} />}</div>
      <div className="media-source-tabs" role="tablist" aria-label="Media source">
        <button type="button" role="tab" aria-selected={sourceType === "upload"} className={sourceType === "upload" ? "active" : ""} disabled={busy} onClick={() => setSourceType("upload")}><Upload size={15} /> Upload video</button>
        <button type="button" role="tab" aria-selected={sourceType === "youtube"} className={sourceType === "youtube" ? "active" : ""} disabled={busy} onClick={() => setSourceType("youtube")}><CirclePlay size={15} /> YouTube link</button>
      </div>
      {sourceType === "upload" ? <form className="media-upload-fields" onSubmit={handleSubmit} noValidate>
        {message ? <div className={`auth-message auth-message-${status === "error" ? "error" : "success"}`} role={status === "error" ? "alert" : "status"}>{status === "error" ? <XCircle size={17} /> : busy ? <LoaderCircle className="auth-spinner" size={17} /> : <CheckCircle2 size={17} />}<span>{message}</span></div> : null}
        {["validating", "uploading", "submitting", "success"].includes(status) ? <div className="media-upload-progress" role="progressbar" aria-label="Video upload and submission progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploadProgress}><span style={{ width: `${uploadProgress}%` }} /><small>{uploadProgress}%</small></div> : null}
        <label><span>Advertiser business</span><select name="organizationId" defaultValue="" required disabled={busy}><option value="" disabled>Select business</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label>
        <label className="media-file-field"><span>MP4 video</span><input name="file" type="file" accept="video/mp4,.mp4" required disabled={busy} onChange={(event) => { const file = event.currentTarget.files?.[0]; if (!file) return; if (!mediaNameEdited || !mediaName.trim()) setMediaName(mediaNameFromFilename(file.name)); }} /><small>Any duration / 16:9 / minimum 1280 x 720 / maximum 100 MB</small></label>
        <label><span>Media name <small>Optional rename</small></span><input name="name" value={mediaName} onChange={(event) => { setMediaName(event.target.value); setMediaNameEdited(true); }} minLength={2} maxLength={120} placeholder="Filled from the uploaded filename" required disabled={busy} /></label>
        <label className="media-rights"><input name="compressVideo" type="checkbox" defaultChecked disabled={busy} /><span><strong>Compress and optimize after upload</strong><small>Turn off to preserve source quality. The file will still be prepared for reliable streaming.</small></span></label>
        <label className="media-rights"><input name="rightsDeclared" type="checkbox" required disabled={busy} /><span>I confirm that this business owns or has permission to use all video, music, logos, people, and claims in this advertisement.</span></label>
        <div className="media-upload-actions"><button className="button button-primary" type="submit" disabled={busy}>{busy ? <LoaderCircle className="auth-spinner" size={17} /> : <Upload size={17} />}{busy ? "Processing upload..." : pendingPhase === "uploaded" ? "Retry processing" : pendingPhase ? "Retry upload" : autoApproves ? "Upload video" : "Upload and submit for review"}</button>{pendingPhase && status !== "submitting" ? <button className="button button-secondary" type="button" onClick={handleCancel}>{status === "uploading" ? "Cancel upload" : "Discard unfinished upload"}</button> : null}</div>
      </form> : <form className="media-upload-fields" action={youtubeAction}>
        {youtubeState.message ? <div className={`auth-message auth-message-${youtubeState.status}`} role={youtubeState.status === "error" ? "alert" : "status"}>{youtubeState.status === "error" ? <XCircle size={17} /> : <CheckCircle2 size={17} />}<span>{youtubeState.message}</span></div> : null}
        <label><span>Advertiser business</span><select name="organizationId" defaultValue="" required disabled={youtubePending}><option value="" disabled>Select business</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label>
        <label><span>Media name</span><input name="name" minLength={2} maxLength={120} placeholder="YouTube brand story" required disabled={youtubePending} /></label>
        <label><span>YouTube video URL</span><span className="input-with-icon"><Link2 size={15} /><input name="url" type="url" maxLength={500} placeholder="https://www.youtube.com/watch?v=..." required disabled={youtubePending} /></span><small>Supports YouTube watch, Shorts, embed, and youtu.be links. The video must allow embedding.</small></label>
        <label><span>Exact video duration in seconds</span><input name="durationSeconds" type="number" min={5} max={3600} step={1} placeholder="30" required disabled={youtubePending} /><small>Used to keep every viewer synchronized in the continuous channel loop.</small></label>
        <label className="media-rights"><input name="rightsDeclared" type="checkbox" required disabled={youtubePending} /><span>I confirm that this business owns or has permission to stream this YouTube video and all content contained in it.</span></label>
        <button className="button button-primary" type="submit" disabled={youtubePending}>{youtubePending ? <LoaderCircle className="auth-spinner" size={17} /> : <CirclePlay size={17} />}{youtubePending ? "Adding..." : autoApproves ? "Add YouTube video" : "Submit YouTube video for review"}</button>
      </form>}
    </section>
  );
}

export function MediaModerationPanel({ asset }: { asset: MediaLibraryItem }) {
  const [state, formAction, pending] = useActionState(moderateMedia, initialActionState);
  if (asset.rawStatus !== "in_review" || asset.processingStatus !== "ready") return null;
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
