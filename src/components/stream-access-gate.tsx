"use client";

import { EyeOff, LoaderCircle, LogIn, RadioTower, UserRoundCheck, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ApprovedStreamViewer } from "@/lib/streaming/viewer-session";

type ViewerMode = "anonymous" | "registered";

export function AnonymousStreamBootstrap({ channelId, accessKey }: { channelId: string; accessKey: string }) {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void fetch("/api/v1/streams/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId, accessKey, mode: "anonymous" }),
    }).then(async (response) => {
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(result?.error || "The stream could not be started.");
      }
      router.refresh();
    }).catch((caught) => setError(caught instanceof Error ? caught.message : "The stream could not be started."));
  }, [accessKey, channelId, router]);

  return <main className="stream-access-page">
    <section className="stream-bootstrap-card" aria-live="polite">
      {error ? <><RadioTower size={32} /><h1>Stream temporarily unavailable</h1><p>{error}</p><button type="button" onClick={() => window.location.reload()}>Try again</button></> : <><LoaderCircle className="auth-spinner" size={34} /><h1>Starting live stream</h1><p>You are joining anonymously. No login is required.</p></>}
    </section>
  </main>;
}

export function StreamAccessGate({ channelId, accessKey, channelName, approvedViewer, open, onClose }: {
  channelId: string;
  accessKey: string;
  channelName: string;
  approvedViewer: ApprovedStreamViewer | null;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<ViewerMode>("registered");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  if (!open) return null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const passcode = String(form.get("passcode") ?? "").replace(/\D/g, "");
    if (mode === "anonymous" && !passcode) {
      onClose();
      return;
    }
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/v1/streams/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId, accessKey, passcode, mode }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Viewer access could not be updated.");
      onClose();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Viewer access could not be updated.");
      setPending(false);
    }
  }

  return <div className="stream-access-modal" role="dialog" aria-modal="true" aria-labelledby="stream-access-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="stream-access-card">
      <button className="stream-access-close" type="button" aria-label="Close viewer login" onClick={onClose}><X size={20} /></button>
      <div className="stream-access-icon"><LogIn size={23} /></div>
      <p className="eyebrow">Optional viewer login</p>
      <h1 id="stream-access-title">{channelName}</h1>
      <p>The stream keeps playing without login. Connect a business code only when you want this viewing session attributed.</p>
      <div className="stream-viewer-choice" role="group" aria-label="Viewer identity preference">
        <button className={mode === "anonymous" ? "active" : ""} type="button" onClick={() => { setMode("anonymous"); setError(""); }}><EyeOff size={18} /><span><strong>Anonymous viewer</strong><small>Optionally connect a business code without sharing your identity.</small></span></button>
        <button className={mode === "registered" ? "active" : ""} type="button" onClick={() => { setMode("registered"); setError(""); }}><UserRoundCheck size={18} /><span><strong>Registered viewer</strong><small>Use an administrator-approved account.</small></span></button>
      </div>
      <form onSubmit={submit} noValidate>
        {mode === "registered" ? approvedViewer ? <div className="stream-approved-viewer"><UserRoundCheck size={18} /><span><strong>{approvedViewer.name}</strong><small>{approvedViewer.email} · administrator approved</small></span></div> : <div className="stream-registration-required"><UserRoundCheck size={18} /><span><strong>Approved account required</strong><small>Sign in with an account approved by the current administrator.</small></span></div> : null}
        <label className="stream-code-field"><span>Six-digit business code{mode === "anonymous" ? " (optional)" : ""}</span><input name="passcode" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={mode === "registered" ? 6 : undefined} maxLength={6} required={mode === "registered"} placeholder="000000" aria-describedby="stream-code-hint" /><small id="stream-code-hint">Find this code in the host business profile.</small></label>
        {error ? <p className="stream-access-error" role="alert">{error}</p> : null}
        {mode === "registered" && !approvedViewer ? <Link className="stream-access-submit" href={`/login?next=${encodeURIComponent(`/stream/${channelId}/${accessKey}`)}`}>Sign in to an approved account</Link> : <button className="stream-access-submit" type="submit" disabled={pending}>{pending ? <LoaderCircle className="auth-spinner" size={18} /> : mode === "registered" ? <LogIn size={18} /> : <EyeOff size={18} />}{pending ? "Connecting…" : mode === "registered" ? "Connect registered viewer" : "Continue watching"}</button>}
      </form>
      <small className="stream-access-privacy">Closing this window keeps the stream playing anonymously.</small>
    </section>
  </div>;
}
