"use client";

import { EyeOff, LoaderCircle, Maximize2, UserRoundCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import type { ApprovedStreamViewer } from "@/lib/streaming/viewer-session";

type ViewerMode = "anonymous" | "registered";

export function StreamAccessGate({ channelId, accessKey, channelName, description, approvedViewer }: {
  channelId: string;
  accessKey: string;
  channelName: string;
  description: string;
  approvedViewer: ApprovedStreamViewer | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<ViewerMode>("anonymous");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    // Browsers require fullscreen to be requested synchronously from the user
    // gesture. Invalid access immediately exits it again below.
    const fullscreenRequest = document.fullscreenElement
      ? Promise.resolve()
      : document.documentElement.requestFullscreen?.().catch(() => undefined);
    const form = new FormData(event.currentTarget);
    const payload = {
      channelId,
      accessKey,
      passcode: String(form.get("passcode") ?? "").replace(/\D/g, ""),
      mode,
    };
    try {
      const response = await fetch("/api/v1/streams/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Stream access could not be validated.");
      await fullscreenRequest;
      router.refresh();
    } catch (caught) {
      if (document.fullscreenElement) await document.exitFullscreen?.().catch(() => undefined);
      setError(caught instanceof Error ? caught.message : "Stream access could not be validated.");
      setPending(false);
    }
  }

  return <main className="stream-access-page">
    <section className="stream-access-card">
      <div className="stream-access-icon"><Maximize2 size={24} /></div>
      <p className="eyebrow">Private business stream</p>
      <h1>{channelName}</h1>
      <p>{description || "Enter the business access code to start the live channel."}</p>

      <div className="stream-viewer-choice" role="group" aria-label="Viewer identity preference">
        <button className={mode === "anonymous" ? "active" : ""} type="button" onClick={() => setMode("anonymous")}><EyeOff size={18} /><span><strong>Stay anonymous</strong><small>Only an anonymous viewer count is recorded.</small></span></button>
        <button className={mode === "registered" ? "active" : ""} type="button" onClick={() => setMode("registered")}><UserRoundCheck size={18} /><span><strong>Registered viewer</strong><small>Use an account approved by the platform administrator.</small></span></button>
      </div>

      <form onSubmit={submit} noValidate>
        {mode === "registered" ? approvedViewer ? <div className="stream-approved-viewer"><UserRoundCheck size={18} /><span><strong>{approvedViewer.name}</strong><small>{approvedViewer.email} · administrator approved</small></span></div> : <div className="stream-registration-required"><UserRoundCheck size={18} /><span><strong>Approved account required</strong><small>Accounts are invitation-only and must be approved by the current administrator.</small></span></div> : null}
        <label className="stream-code-field"><span>Six-digit business code</span><input name="passcode" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required placeholder="000000" aria-describedby="stream-code-hint" /><small id="stream-code-hint">Find this code in the host business profile.</small></label>
        {error ? <p className="stream-access-error" role="alert">{error}</p> : null}
        {mode === "registered" && !approvedViewer ? <Link className="stream-access-submit" href={`/login?next=${encodeURIComponent(`/stream/${channelId}/${accessKey}`)}`}>Sign in to an approved account</Link> : <button className="stream-access-submit" type="submit" disabled={pending}>{pending ? <LoaderCircle className="auth-spinner" size={18} /> : <Maximize2 size={18} />}{pending ? "Validating…" : "Validate and watch fullscreen"}</button>}
      </form>
      <small className="stream-access-privacy">Viewing activity is used for access control, audience reporting, and verified credit accounting.</small>
    </section>
  </main>;
}
