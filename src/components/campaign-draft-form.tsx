"use client";

import { CalendarDays, CheckCircle2, LoaderCircle, Plus, Save, ShieldCheck, Target } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { createCampaignDraft, type CampaignActionState } from "@/app/(platform)/campaigns/actions";

export type CampaignAdvertiserOption = { id: number; name: string; category: string };
export type CampaignMediaOption = { id: number; name: string; organizationId: number; organization: string };
export type CampaignTargetOption = { id: number; name: string; category: string };

export type CampaignFieldDefaults = {
  name: string;
  mediaAssetId: number;
  startsOn: string;
  endsOn: string;
  budgetCredits: number;
  dailyCapCredits: number | null;
  frequencyCapPerDay: number | null;
  targetIds: number[];
};

const initialState: CampaignActionState = { status: "idle", message: "" };

export function CampaignFields({
  advertisers,
  media,
  targets,
  minimumDate,
  initialOrganizationId,
  allowAdvertiserSelection,
  defaults,
  pending,
  mode,
}: {
  advertisers: CampaignAdvertiserOption[];
  media: CampaignMediaOption[];
  targets: CampaignTargetOption[];
  minimumDate: string;
  initialOrganizationId: number | null;
  allowAdvertiserSelection: boolean;
  defaults?: CampaignFieldDefaults;
  pending: boolean;
  mode: "create" | "edit";
}) {
  const [organizationId, setOrganizationId] = useState(initialOrganizationId ?? 0);
  const availableMedia = media.filter((asset) => asset.organizationId === organizationId);
  const availableTargets = targets.filter((target) => target.id !== organizationId);
  const advertiser = advertisers.find((option) => option.id === organizationId);
  const ready = organizationId > 0 && availableMedia.length > 0 && availableTargets.length > 0;

  return <>
    <div className="campaign-field-grid">
      {allowAdvertiserSelection ? <label><span>Advertiser business</span><select name="organizationId" required value={organizationId || ""} onChange={(event) => setOrganizationId(Number(event.target.value))}><option value="" disabled>Select business</option>{advertisers.map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}</select></label> : <><input type="hidden" name="organizationId" value={organizationId} /><label><span>Advertiser business</span><input value={advertiser?.name ?? "Business"} readOnly /></label></>}
      <label><span>Campaign name</span><input name="name" required minLength={3} maxLength={120} defaultValue={defaults?.name} placeholder="Autumn lunch promotion" /></label>
      <label><span>Approved media</span><select name="mediaAssetId" required defaultValue={defaults?.mediaAssetId ?? ""} key={`${organizationId}-${defaults?.mediaAssetId ?? "new"}`}><option value="" disabled>{organizationId ? "Select media" : "Select a business first"}</option>{availableMedia.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
      <label><span>Starts on</span><input name="startsOn" type="date" min={minimumDate} required defaultValue={defaults?.startsOn} /></label>
      <label><span>Ends on</span><input name="endsOn" type="date" min={minimumDate} required defaultValue={defaults?.endsOn} /></label>
      <label><span>Total budget credits</span><input name="budgetCredits" type="number" min="1" max="1000000000" step="0.01" required defaultValue={defaults?.budgetCredits} placeholder="500" /></label>
      <label><span>Daily cap <small>Optional</small></span><input name="dailyCapCredits" type="number" min="1" max="1000000000" step="0.01" defaultValue={defaults?.dailyCapCredits ?? ""} placeholder="50" /></label>
      <label><span>Per-screen daily frequency <small>Optional</small></span><input name="frequencyCapPerDay" type="number" min="1" max="100" step="1" defaultValue={defaults?.frequencyCapPerDay ?? ""} placeholder="3" /></label>
    </div>
    <fieldset className="campaign-targets"><legend>Target businesses</legend><p>Select where this campaign may be delivered. The advertiser business is excluded automatically.</p><div>{availableTargets.map((target) => <label key={target.id}><input type="checkbox" name="targetOrganizationIds" value={target.id} defaultChecked={defaults?.targetIds.includes(target.id)} /><span><strong>{target.name}</strong><small>{target.category}</small></span></label>)}</div></fieldset>
    {!ready ? <div className="campaign-prerequisite"><ShieldCheck size={18} /><div><strong>Campaign prerequisites required</strong><p>{organizationId === 0 ? "Select the advertiser business. " : ""}{organizationId > 0 && availableMedia.length === 0 ? "This business needs approved, processed media. " : ""}{organizationId > 0 && availableTargets.length === 0 ? "At least one other active business is required." : ""}</p></div></div> : null}
    {mode === "create" ? <div className="campaign-draft-note"><CalendarDays size={17} /><p><strong>Saved as a draft</strong><span>Campaign activation remains locked until the credit-hold service can reserve the budget safely.</span></p></div> : null}
    <button className="button button-primary" type="submit" disabled={pending || !ready}>{pending ? <LoaderCircle className="auth-spinner" size={16} /> : mode === "create" ? <Plus size={16} /> : <Save size={16} />}{pending ? (mode === "create" ? "Creating draft..." : "Saving changes...") : mode === "create" ? "Create draft" : "Save campaign"}</button>
  </>;
}

export function CampaignDraftForm({
  advertisers,
  media,
  targets,
  minimumDate,
  initialOrganizationId,
  isPlatformAdmin,
}: {
  advertisers: CampaignAdvertiserOption[];
  media: CampaignMediaOption[];
  targets: CampaignTargetOption[];
  minimumDate: string;
  initialOrganizationId: number | null;
  isPlatformAdmin: boolean;
}) {
  const [state, action, pending] = useActionState(createCampaignDraft, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.status === "success") formRef.current?.reset(); }, [state.status]);

  return <section className="campaign-create panel" id="create-campaign">
    <div className="panel-header"><div><h2>Create campaign draft</h2><p>{isPlatformAdmin ? "Choose the advertiser, then plan its approved media, audience, dates, and delivery limits." : "Plan approved media, target businesses, dates, and delivery limits."}</p></div><Target size={20} /></div>
    <form ref={formRef} action={action} className="campaign-create-form">
      {state.message ? <div className={`auth-message auth-message-${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.status === "success" ? <CheckCircle2 size={16} /> : <ShieldCheck size={16} />}<span>{state.message}</span></div> : null}
      <CampaignFields advertisers={advertisers} media={media} targets={targets} minimumDate={minimumDate} initialOrganizationId={initialOrganizationId} allowAdvertiserSelection={isPlatformAdmin} pending={pending} mode="create" />
    </form>
  </section>;
}
