"use client";

import { CheckCircle2, LoaderCircle, Plus, RadioTower, ShieldCheck, Trash2 } from "lucide-react";
import { useActionState } from "react";
import { assignBusinessAdToChannel, removeBusinessAdFromChannel, type BusinessAdActionState } from "@/app/(platform)/business/actions";
import type { OrganizationAdminData, OrganizationAdminRow } from "@/lib/repositories/organizations";

const initialState: BusinessAdActionState = { status: "idle", message: "" };

export function BusinessChannelAds({ organization, channels }: { organization: OrganizationAdminRow; channels: OrganizationAdminData["channels"] }) {
  const [state, action, pending] = useActionState(assignBusinessAdToChannel, initialState);
  return <section className="business-channel-ads">
    <div className="business-subsection-title"><RadioTower size={16} /><div><strong>Ad channel assignments</strong><small>Choose exactly which approved ads from this business appear in each stream.</small></div></div>
    {state.message ? <div className={`auth-message auth-message-${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.status === "success" ? <CheckCircle2 size={14} /> : <ShieldCheck size={14} />}<span>{state.message}</span></div> : null}
    <form action={action} className="business-channel-ad-form">
      <input type="hidden" name="organizationId" value={organization.id} />
      <select name="assetId" defaultValue="" required disabled={pending || organization.approvedAds.length === 0}><option value="" disabled>{organization.approvedAds.length ? "Select approved ad" : "No approved ads"}</option>{organization.approvedAds.map((asset) => <option value={asset.id} key={asset.id}>{asset.name}</option>)}</select>
      <select name="channelId" defaultValue="" required disabled={pending || channels.length === 0}><option value="" disabled>{channels.length ? "Select channel" : "No channels available"}</option>{channels.map((channel) => <option value={channel.id} key={channel.id}>{channel.name} · {channel.status}</option>)}</select>
      <button className="button button-secondary" type="submit" disabled={pending || !organization.approvedAds.length || !channels.length}>{pending ? <LoaderCircle className="auth-spinner" size={14} /> : <Plus size={14} />} Assign ad</button>
    </form>
    <div className="business-channel-ad-list">{organization.channelAds.length ? organization.channelAds.map((assignment) => <div key={assignment.itemId}><span><strong>{assignment.assetName}</strong><small>{assignment.channelName}</small></span><form action={removeBusinessAdFromChannel} onSubmit={(event) => { if (!window.confirm(`Remove ${assignment.assetName} from ${assignment.channelName}?`)) event.preventDefault(); }}><input type="hidden" name="organizationId" value={organization.id} /><input type="hidden" name="itemId" value={assignment.itemId} /><button type="submit" aria-label={`Remove ${assignment.assetName} from ${assignment.channelName}`}><Trash2 size={13} /></button></form></div>) : <p>No ads assigned to a channel yet.</p>}</div>
  </section>;
}
