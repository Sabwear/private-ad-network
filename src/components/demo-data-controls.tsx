"use client";

import { AlertTriangle, CheckCircle2, LoaderCircle, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import { clearDemoData, type DemoCleanupState } from "@/app/(platform)/admin/actions";
import type { DemoDataSummary } from "@/lib/repositories/demo-data";

const initialState: DemoCleanupState = { status: "idle", message: "" };

export function DemoDataControls({ summary }: { summary: DemoDataSummary }) {
  const [state, action, pending] = useActionState(clearDemoData, initialState);
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const total = summary.businesses + summary.locations + summary.screens + summary.media + summary.campaigns;
  const ready = acknowledged && confirmation === "DELETE DEMO DATA" && total > 0;

  return <section className="demo-settings panel">
    <div className="panel-header"><div><h2>Demo content controls</h2><p>Administrator-only settings for the clearly marked beta dataset.</p></div><AlertTriangle size={20} /></div>
    <div className="demo-summary"><div><strong>{summary.businesses}</strong><span>Businesses</span></div><div><strong>{summary.locations}</strong><span>Locations</span></div><div><strong>{summary.screens}</strong><span>Screens</span></div><div><strong>{summary.media}</strong><span>Media</span></div><div><strong>{summary.campaigns}</strong><span>Campaigns</span></div></div>
    <form action={action} className="demo-cleanup-form" onSubmit={(event) => { if (!window.confirm("Final confirmation: permanently remove every marked demo record and demo media file?")) event.preventDefault(); }}>
      {state.message ? <div className={`auth-message auth-message-${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.status === "success" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}<span>{state.message}</span></div> : null}
      <label className="demo-acknowledgement"><input type="checkbox" name="acknowledged" value="yes" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span>I understand this permanently removes only records marked as demo content.</span></label>
      <label><span>Type <code>DELETE DEMO DATA</code> to continue</span><input name="confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></label>
      <button className="button button-danger" type="submit" disabled={!ready || pending}>{pending ? <LoaderCircle className="auth-spinner" size={16} /> : <Trash2 size={16} />}{pending ? "Clearing demo data…" : "Clear demo data"}</button>
    </form>
  </section>;
}
