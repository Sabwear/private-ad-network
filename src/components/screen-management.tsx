"use client";

import { CheckCircle2, ExternalLink, KeyRound, LoaderCircle, MonitorOff, MonitorUp, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { claimScreen, suspendScreen, type ScreenActionState } from "@/app/(platform)/screens/actions";
import type { ScreenInventoryItem, ScreenLocationOption } from "@/lib/repositories/screens";

const initialState: ScreenActionState = { status: "idle", message: "" };

function FieldError({ message }: { message?: string }) {
  return message ? <small className="management-field-error">{message}</small> : null;
}

export function ScreenPairingPanel({ locations }: { locations: ScreenLocationOption[] }) {
  const [state, formAction, pending] = useActionState(claimScreen, initialState);
  const ready = locations.length > 0;

  return (
    <section className="screen-pairing-grid">
      <article className="panel screen-pairing-guide">
        <span><MonitorUp size={23} /></span>
        <div><p className="eyebrow">Secure activation</p><h2>Connect a playback screen</h2><p>Open the device setup page on the TV or player. It creates a device-only key and displays a short-lived pairing code.</p></div>
        <Link className="button button-secondary" href="/device/setup" target="_blank" rel="noreferrer"><ExternalLink size={16} /> Open device setup</Link>
      </article>
      <form className="panel management-form screen-pairing-form" action={formAction} noValidate>
        <div className="panel-header"><div><h2>Claim pairing code</h2><p>Assign the detected device to an approved active location.</p></div><KeyRound size={19} /></div>
        <div className="management-form-body">
          {state.message ? <div className={`auth-message auth-message-${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.status === "success" ? <CheckCircle2 size={17} /> : <ShieldCheck size={17} />}<span>{state.message}</span></div> : null}
          <label><span>Pairing code</span><input className="pairing-code-input" name="code" minLength={6} maxLength={6} autoCapitalize="characters" autoComplete="one-time-code" placeholder="ABC234" required aria-invalid={Boolean(state.fieldErrors?.code)} /><FieldError message={state.fieldErrors?.code} /></label>
          <label><span>Location</span><select name="locationId" defaultValue="" required disabled={!ready} aria-invalid={Boolean(state.fieldErrors?.locationId)}><option value="" disabled>{ready ? "Select an active location" : "Create an active location first"}</option>{locations.map((location) => <option value={location.id} key={location.id}>{location.organization} - {location.name}</option>)}</select><FieldError message={state.fieldErrors?.locationId} /></label>
          <label><span>Screen name</span><input name="name" maxLength={120} required placeholder="Reception display" aria-invalid={Boolean(state.fieldErrors?.name)} /><FieldError message={state.fieldErrors?.name} /></label>
          <label><span>Pairing reason</span><textarea name="reason" rows={2} maxLength={300} required placeholder="Approved installation at the reception display." aria-invalid={Boolean(state.fieldErrors?.reason)} /><FieldError message={state.fieldErrors?.reason} /></label>
          <button className="button button-primary management-submit" type="submit" disabled={pending || !ready}>{pending ? <LoaderCircle className="auth-spinner" size={17} /> : <MonitorUp size={17} />}{pending ? "Pairing screen..." : "Pair screen"}</button>
        </div>
      </form>
    </section>
  );
}

export function DeviceInspector({ screen }: { screen: ScreenInventoryItem }) {
  const [state, formAction, pending] = useActionState(suspendScreen, initialState);
  const canSuspend = !["Suspended", "Revoked"].includes(screen.status);

  return (
    <details className="device-inspector">
      <summary>Inspect</summary>
      <div className="device-inspector-panel">
        <header><div><p className="eyebrow">Device identity</p><h2>{screen.name}</h2><small>{screen.location}</small></div><ShieldCheck size={22} /></header>
        <dl className="device-facts">
          <div><dt>Detected type</dt><dd>{screen.deviceType}</dd></div>
          <div><dt>Operating system</dt><dd>{screen.operatingSystem}</dd></div>
          <div><dt>Runtime</dt><dd>{screen.browser}</dd></div>
          <div><dt>Application</dt><dd>{screen.appVersion}</dd></div>
          <div><dt>IP address</dt><dd><code>{screen.ipAddress}</code></dd></div>
          <div><dt>Country / edge</dt><dd>{screen.region} / {screen.edge}</dd></div>
          <div><dt>Display</dt><dd>{screen.display}</dd></div>
          <div><dt>Network hint</dt><dd>{screen.network}</dd></div>
          <div><dt>Locale</dt><dd>{screen.locale}</dd></div>
          <div><dt>Timezone</dt><dd>{screen.timezone}</dd></div>
          <div><dt>Last observation</dt><dd>{screen.observedAt}</dd></div>
          <div className="device-fact-wide"><dt>Public-key fingerprint</dt><dd><code>{screen.keyFingerprint}</code></dd></div>
        </dl>
        <p className="device-privacy-note">Diagnostics are collected for security, support, and playback reliability. Audience identity and camera data are not collected.</p>
        {screen.suspensionReason ? <div className="auth-message auth-message-error"><MonitorOff size={16} /><span>{screen.suspensionReason}</span></div> : null}
        {state.message ? <div className={`auth-message auth-message-${state.status}`} role={state.status === "error" ? "alert" : "status"}><ShieldCheck size={16} /><span>{state.message}</span></div> : null}
        {canSuspend ? <form action={formAction} className="device-suspension-form"><input type="hidden" name="devicePublicId" value={screen.id} /><label><span>Suspension reason</span><textarea name="reason" rows={2} maxLength={300} required placeholder="Device removed from the approved location." /></label><button className="button button-danger" type="submit" disabled={pending}>{pending ? <LoaderCircle className="auth-spinner" size={16} /> : <MonitorOff size={16} />}{pending ? "Suspending..." : "Suspend and revoke credential"}</button></form> : null}
      </div>
    </details>
  );
}
