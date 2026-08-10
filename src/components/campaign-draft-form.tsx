"use client";

import { CalendarDays, CheckCircle2, LoaderCircle, Plus, ShieldCheck, Target } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { createCampaignDraft, type CampaignActionState } from "@/app/(platform)/campaigns/actions";

const initialState: CampaignActionState = { status: "idle", message: "" };

export function CampaignDraftForm({
  media,
  targets,
  minimumDate,
}: {
  media: Array<{ id: number; name: string }>;
  targets: Array<{ id: number; name: string; category: string }>;
  minimumDate: string;
}) {
  const [state, action, pending] = useActionState(createCampaignDraft, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.status === "success") formRef.current?.reset(); }, [state.status]);
  const ready = media.length > 0 && targets.length > 0;

  return <section className="campaign-create panel">
    <div className="panel-header"><div><h2>Create campaign draft</h2><p>Plan approved media, target businesses, dates, and delivery limits.</p></div><Target size={20} /></div>
    {!ready ? <div className="campaign-prerequisite"><ShieldCheck size={18} /><div><strong>Campaign prerequisites required</strong><p>{media.length === 0 ? "Approve and finish processing at least one media item. " : ""}{targets.length === 0 ? "At least one other active business must be available." : ""}</p></div></div> : null}
    <form ref={formRef} action={action} className="campaign-create-form">
      {state.message ? <div className={`auth-message auth-message-${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.status === "success" ? <CheckCircle2 size={16} /> : <ShieldCheck size={16} />}<span>{state.message}</span></div> : null}
      <div className="campaign-field-grid">
        <label><span>Campaign name</span><input name="name" required minLength={3} maxLength={120} placeholder="Autumn lunch promotion" /></label>
        <label><span>Approved media</span><select name="mediaAssetId" required defaultValue=""><option value="" disabled>Select media</option>{media.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
        <label><span>Starts on</span><input name="startsOn" type="date" min={minimumDate} required /></label>
        <label><span>Ends on</span><input name="endsOn" type="date" min={minimumDate} required /></label>
        <label><span>Total budget credits</span><input name="budgetCredits" type="number" min="1" max="1000000000" step="0.01" required placeholder="500" /></label>
        <label><span>Daily cap <small>Optional</small></span><input name="dailyCapCredits" type="number" min="1" max="1000000000" step="0.01" placeholder="50" /></label>
        <label><span>Per-screen daily frequency <small>Optional</small></span><input name="frequencyCapPerDay" type="number" min="1" max="100" step="1" placeholder="3" /></label>
      </div>
      <fieldset className="campaign-targets"><legend>Target businesses</legend><p>Select where this campaign may be delivered. Your own business is excluded automatically.</p><div>{targets.map((target) => <label key={target.id}><input type="checkbox" name="targetOrganizationIds" value={target.id} /><span><strong>{target.name}</strong><small>{target.category}</small></span></label>)}</div></fieldset>
      <div className="campaign-draft-note"><CalendarDays size={17} /><p><strong>Saved as a draft</strong><span>Campaign activation remains locked until the credit-hold service can reserve the budget safely.</span></p></div>
      <button className="button button-primary" type="submit" disabled={pending || !ready}>{pending ? <LoaderCircle className="auth-spinner" size={16} /> : <Plus size={16} />}{pending ? "Creating draft…" : "Create draft"}</button>
    </form>
  </section>;
}
