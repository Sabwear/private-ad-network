"use client";

import { CheckCircle2, Copy, ExternalLink, LoaderCircle, Pencil, Plus, RadioTower, Settings2, ShieldCheck, Trash2, UsersRound, Video } from "lucide-react";
import { useActionState, useState } from "react";
import { addChannelMedia, createChannel, deleteChannel, rotateChannelAccessKey, type ChannelActionState, removeChannelMedia, setBusinessAssignment, updateChannel, updateChannelDisplaySettings } from "@/app/(platform)/channels/actions";
import { StatusPill } from "@/components/status-pill";
import { ChannelDisplaySettingsFields } from "@/components/channel-display-settings-fields";
import type { ChannelManagementData } from "@/lib/repositories/channels";

const initialState: ChannelActionState = { status: "idle", message: "" };

function CopyStreamLink({ path, hostname }: { path: string; hostname: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(hostname ? `https://${hostname}` : `${window.location.origin}${path}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }
  return <button type="button" className="button button-secondary" onClick={copy}>{copied ? <CheckCircle2 size={15} /> : <Copy size={15} />}{copied ? "Copied" : "Copy stream link"}</button>;
}

function ChannelEditor({ channel }: { channel: ChannelManagementData["channels"][number] }) {
  const [state, action, pending] = useActionState(updateChannel, initialState);
  return <details className="management-editor management-editor-wide channel-editor"><summary><Pencil size={13} /> Edit channel</summary><form action={action} className="management-inline-form"><header><strong>Edit channel</strong><small>Control channel availability, identity, and public stream addresses.</small></header><input type="hidden" name="channelPublicId" value={channel.publicId} />{state.message ? <div className={`auth-message auth-message-${state.status}`}><ShieldCheck size={15} /><span>{state.message}</span></div> : null}<label><span>Channel availability</span><select name="status" defaultValue={channel.status}><option value="active">Viewer link available</option><option value="paused">Viewer link unavailable</option></select></label><label><span>Channel name</span><input name="name" minLength={2} maxLength={120} defaultValue={channel.name} required /></label><div className="management-field-grid"><label><span>Public stream path</span><div className="stream-address-field"><code>/watch/</code><input name="slug" minLength={3} maxLength={80} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" defaultValue={channel.slug} required /></div><small>Changing this replaces the previous clean link.</small></label><label><span>Custom hostname <small>Optional</small></span><input name="customHostname" maxLength={253} defaultValue={channel.customHostname} placeholder="live.example.com" /><small>Point this hostname to the deployed app in DNS and hosting settings.</small></label></div><label><span>Description</span><textarea name="description" maxLength={300} rows={3} defaultValue={channel.description} /></label><button className="button button-primary" type="submit" disabled={pending}>{pending ? <LoaderCircle className="auth-spinner" size={15} /> : <Pencil size={15} />}{pending ? "Saving..." : "Save channel details"}</button></form></details>;
}

function ChannelVideoSettings({ channel }: { channel: ChannelManagementData["channels"][number] }) {
  const [state, action, pending] = useActionState(updateChannelDisplaySettings, initialState);
  return <details className="channel-video-settings">
    <summary><span><Settings2 size={17} /><span><strong>Channel settings</strong><small>Video presentation and viewer controls</small></span></span><span className={`channel-broadcast-state ${channel.settings.broadcastEnabled ? "is-running" : ""}`}><RadioTower size={14} />{channel.settings.broadcastEnabled ? "Broadcast clock running" : "Broadcast on standby"}</span></summary>
    <form action={action} className="management-inline-form">
      <input type="hidden" name="channelPublicId" value={channel.publicId} />
      {state.message ? <div className={`auth-message auth-message-${state.status}`} role={state.status === "error" ? "alert" : "status"}><ShieldCheck size={15} /><span>{state.message}</span></div> : null}
      <div className="channel-broadcast-summary"><RadioTower size={18} /><span><strong>{channel.settings.broadcastEnabled ? "Broadcast clock running" : "Broadcast on standby"}</strong><small>All viewers join the same point in the channel loop.</small></span></div>
      <ChannelDisplaySettingsFields settings={channel.settings} />
      <button className="button button-primary" type="submit" disabled={pending}>{pending ? <LoaderCircle className="auth-spinner" size={15} /> : <Settings2 size={15} />}{pending ? "Saving..." : "Save video settings"}</button>
    </form>
  </details>;
}

export function ChannelManagement({ data }: { data: ChannelManagementData }) {
  const [state, formAction, pending] = useActionState(createChannel, initialState);
  return <>
    <section className="channel-create panel">
      <div className="panel-header"><div><h2>Create another channel</h2><p>The primary channel is ready now; this control supports future network streams.</p></div><RadioTower size={20} /></div>
      <form action={formAction} className="channel-create-form">
        {state.message ? <div className={`auth-message auth-message-${state.status}`} role={state.status === "error" ? "alert" : "status"}><ShieldCheck size={16} /><span>{state.message}</span></div> : null}
        <label><span>Channel name</span><input name="name" required minLength={2} maxLength={120} placeholder="Casablanca Retail Channel" /></label>
        <label><span>Description</span><input name="description" maxLength={300} placeholder="Where and why this channel is used" /></label>
        <button className="button button-primary" disabled={pending} type="submit">{pending ? <LoaderCircle className="auth-spinner" size={16} /> : <Plus size={16} />}{pending ? "Creating…" : "Create channel"}</button>
      </form>
    </section>

    <section className="channel-list">
      {data.channels.map((channel) => {
        const assignedIds = new Set(channel.organizations.map((organization) => organization.id));
        const usedAssetIds = new Set(channel.items.map((item) => item.assetId));
        return <article className="channel-card panel" key={channel.publicId}>
          <header className="channel-card-header"><div><span className="channel-live-dot" /><div><p className="eyebrow">Managed stream</p><h2>{channel.name}</h2><p>{channel.description || "No description provided."}</p></div></div><StatusPill tone={channel.status === "active" && channel.settings.broadcastEnabled ? "success" : "warning"}>{channel.status !== "active" ? "unavailable" : channel.settings.broadcastEnabled ? "broadcasting" : "standby"}</StatusPill></header>
          <div className="channel-link-row"><code>{channel.customHostname ? `https://${channel.customHostname}` : channel.streamPath}</code><CopyStreamLink path={channel.streamPath} hostname={channel.customHostname} /><a className="button button-secondary" href={channel.customHostname ? `https://${channel.customHostname}` : channel.streamPath} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Open stream</a><form action={rotateChannelAccessKey} onSubmit={(event) => { if (!window.confirm("Rotate the private access key? Existing canonical links will stop, while the clean path and hostname continue to resolve to the new key.")) event.preventDefault(); }}><input type="hidden" name="channelPublicId" value={channel.publicId} /><button className="button button-secondary" type="submit">Rotate access key</button></form></div>
          <div className="channel-control-grid">
            <section><div className="channel-section-title"><UsersRound size={17} /><div><strong>Assigned businesses</strong><small>Only assign businesses whose screens should receive this channel.</small></div></div>
              <form action={setBusinessAssignment} className="channel-add-form"><input type="hidden" name="channelId" value={channel.id} /><input type="hidden" name="intent" value="assign" /><select name="organizationId" defaultValue="" required><option value="" disabled>Select a business</option>{data.organizations.filter((organization) => organization.status === "active" && !assignedIds.has(organization.id)).map((organization) => <option value={organization.id} key={organization.id}>{organization.name}</option>)}</select><button className="button button-secondary"><Plus size={14} /> Assign</button></form>
              <div className="channel-chip-list">{channel.organizations.length ? channel.organizations.map((organization) => <form action={setBusinessAssignment} key={organization.id}><input type="hidden" name="channelId" value={channel.id} /><input type="hidden" name="organizationId" value={organization.id} /><input type="hidden" name="intent" value="remove" /><span>{organization.name}<button aria-label={`Remove ${organization.name}`}><Trash2 size={12} /></button></span></form>) : <p>No businesses assigned yet.</p>}</div>
            </section>
            <section><div className="channel-section-title"><Video size={17} /><div><strong>Channel media</strong><small>Approved items play continuously in this order.</small></div></div>
              <form action={addChannelMedia} className="channel-add-form"><input type="hidden" name="channelId" value={channel.id} /><select name="assetId" defaultValue="" required><option value="" disabled>Select approved media</option>{data.availableMedia.filter((asset) => !usedAssetIds.has(asset.id)).map((asset) => <option value={asset.id} key={asset.id}>{asset.name} · {asset.owner} · {asset.sourceType === "youtube" ? "YouTube" : "Uploaded"}</option>)}</select><button className="button button-secondary"><Plus size={14} /> Add</button></form>
              <ol className="channel-playlist">{channel.items.length ? channel.items.map((item) => <li key={item.id}><span>{item.position}</span><div><strong>{item.name}</strong><small>{item.owner} · {item.sourceType === "youtube" ? "YouTube" : item.hasHls ? "Adaptive HLS" : "MP4 fallback"} · {item.funded ? `${item.spendableCredits.toFixed(3)} credits available` : `Excluded from live loop: needs ${item.baseRequiredCredits.toFixed(3)} credits`}</small></div><form action={removeChannelMedia}><input type="hidden" name="itemId" value={item.id} /><button aria-label={`Remove ${item.name}`}><Trash2 size={14} /></button></form></li>) : <li className="channel-empty">Add approved media to start this stream.</li>}</ol>
            </section>
          </div>
          <ChannelVideoSettings channel={channel} />
          <footer><span>Channel ID: {channel.publicId}</span><div className="channel-footer-actions"><ChannelEditor channel={channel} /><form action={deleteChannel} onSubmit={(event) => { if (!window.confirm(`Delete ${channel.name}? This cannot be undone.`)) event.preventDefault(); }}><input type="hidden" name="channelPublicId" value={channel.publicId} /><button className="text-button danger-text" type="submit"><Trash2 size={13} /> Delete channel</button></form></div></footer>
        </article>;
      })}
    </section>
  </>;
}
