"use client";

import { Copy, KeyRound, LoaderCircle, RefreshCw, WalletCards } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import {
  regenerateBusinessStreamCode,
  type StreamCreditActionState,
  updateBusinessStreamSettings,
} from "@/app/(platform)/business/actions";

const initialState: StreamCreditActionState = { status: "idle", message: "" };

export type BusinessStreamChannel = { id?: number; name: string; href: string };

export function BusinessStreamAccess({ organizationId, accessCode, accessCodeExpiresAt, earningEnabled, earningRate, consumptionRate, channels, rotations = [], showViewers = false, viewers = [], summary, filters }: {
  organizationId: number;
  accessCode: string;
  accessCodeExpiresAt?: string;
  earningEnabled: boolean;
  earningRate: number;
  consumptionRate: number;
  channels: BusinessStreamChannel[];
  rotations?: Array<{ rotatedAt: string; expiresAt: string }>;
  showViewers?: boolean;
  viewers?: Array<{ id: string; mode: string; name: string; email: string; channel: string; createdAt: string; lastActivityAt: string; status: string; verifiedSeconds: number; earnedCredits: number; consumedCredits: number; rejectedEvents: number }>;
  summary?: { totalSessions: number; activeSessions: number; registeredSessions: number; uniqueRegisteredViewers: number; anonymousSessions: number; verifiedSeconds: number; earnedCredits: number; consumedCredits: number; rejectedEvents: number; insufficientCreditEvents: number };
  filters?: { mode?: string; activity?: string; channelId?: number | null };
}) {
  const router = useRouter();
  const [settingsState, settingsAction, settingsPending] = useActionState(updateBusinessStreamSettings, initialState);
  const [codeState, codeAction, codePending] = useActionState(regenerateBusinessStreamCode, initialState);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    if (!showViewers) return;
    const timer = window.setInterval(() => router.refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [router, showViewers]);

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value.startsWith("/") ? `${window.location.origin}${value}` : value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1800);
  }

  return <section className="business-stream-access">
    <div className="business-subsection-title"><KeyRound size={16} /><span><strong>Viewer access</strong><small>Share the channel link and this unique six-digit business code.</small></span></div>
    <div className="business-stream-code"><span><small>Business code{accessCodeExpiresAt ? ` · expires ${new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(accessCodeExpiresAt))}` : ""}</small><strong>{accessCode}</strong></span><button type="button" onClick={() => copy(accessCode, "code")}><Copy size={15} /> {copied === "code" ? "Copied" : "Copy"}</button></div>
    {channels.length ? <div className="business-stream-links">{channels.map((channel) => <div key={channel.href}><span><strong>{channel.name}</strong><small>{channel.href}</small></span><button type="button" onClick={() => copy(channel.href, channel.href)}><Copy size={14} /> {copied === channel.href ? "Copied" : "Copy link"}</button></div>)}</div> : <p className="business-stream-empty">No streaming channel is assigned to this business yet.</p>}
    <form action={codeAction} className="business-code-refresh"><input type="hidden" name="organizationId" value={organizationId} /><button type="submit" disabled={codePending}>{codePending ? <LoaderCircle className="auth-spinner" size={14} /> : <RefreshCw size={14} />} Regenerate code</button>{codeState.message ? <small className={`form-status-${codeState.status}`}>{codeState.message}</small> : null}</form>
    {rotations.length ? <details className="business-code-history"><summary>Code rotation history ({rotations.length})</summary><ul>{rotations.map((rotation) => <li key={rotation.rotatedAt}><span>Rotated {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(rotation.rotatedAt))}</span><small>Previous code expired {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(rotation.expiresAt))}</small></li>)}</ul></details> : null}

    <form action={settingsAction} className="business-credit-settings">
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="business-subsection-title"><WalletCards size={16} /><span><strong>Stream credits</strong><small>Rates apply per verified minute of active playback.</small></span></div>
      <label className="business-credit-toggle"><input type="checkbox" name="earningEnabled" defaultChecked={earningEnabled} /><span><strong>Earn credits while viewers watch</strong><small>Turn off to keep tracking viewers without paying host credits.</small></span></label>
      <div className="management-field-grid">
        <label><span>Earning rate</span><input name="earningRate" type="number" min="0" max="100000" step="0.000001" defaultValue={earningRate} required /><small>Credits earned / verified minute</small></label>
        <label><span>Ad consumption rate</span><input name="consumptionRate" type="number" min="0" max="100000" step="0.000001" defaultValue={consumptionRate} required /><small>Credits consumed / verified ad minute</small></label>
      </div>
      {settingsState.message ? <p className={`form-status-${settingsState.status}`}>{settingsState.message}</p> : null}
      <button className="button button-primary" type="submit" disabled={settingsPending}>{settingsPending ? <LoaderCircle className="auth-spinner" size={15} /> : <WalletCards size={15} />}{settingsPending ? "Saving…" : "Save credit settings"}</button>
    </form>

    {showViewers ? <div className="business-viewers">
      <div className="business-subsection-title"><span><strong>Viewer and credit analytics</strong><small>Live status refreshes every 30 seconds. Registered identities are administrator-approved.</small></span></div>
      {summary ? <div className="stream-report-metrics"><div><span>Watching now</span><strong>{summary.activeSessions}</strong><small>{summary.totalSessions} total sessions</small></div><div><span>Viewer mix</span><strong>{summary.registeredSessions} / {summary.anonymousSessions}</strong><small>{summary.uniqueRegisteredViewers} unique registered viewers</small></div><div><span>Verified time</span><strong>{(summary.verifiedSeconds / 60).toFixed(1)} min</strong><small>{summary.rejectedEvents} rejected heartbeats</small></div><div><span>Your stream credits</span><strong>{summary.earnedCredits.toFixed(3)} earned as host</strong><small>{summary.consumedCredits.toFixed(3)} spent on your ads · {summary.insufficientCreditEvents} unfunded</small></div></div> : null}
      <form className="stream-report-filters" method="get" action="/profile"><label><span>Identity</span><select name="mode" defaultValue={filters?.mode ?? "all"}><option value="all">All viewers</option><option value="registered">Registered</option><option value="anonymous">Anonymous</option></select></label><label><span>Activity</span><select name="activity" defaultValue={filters?.activity ?? "all"}><option value="all">All activity</option><option value="live">Watching now</option><option value="ended">Ended / inactive</option></select></label><label><span>Channel</span><select name="channel" defaultValue={filters?.channelId ?? ""}><option value="">All channels</option>{channels.map((channel) => <option key={channel.href} value={channel.id ?? ""}>{channel.name}</option>)}</select></label><button className="button button-secondary" type="submit">Apply filters</button><Link className="button button-secondary" href={`/api/reports/stream-viewers.csv?mode=${encodeURIComponent(filters?.mode ?? "all")}&activity=${encodeURIComponent(filters?.activity ?? "all")}&channel=${filters?.channelId ?? ""}`}>Export CSV</Link></form>
      {viewers.length ? <div className="table-scroll"><table><thead><tr><th>Viewer</th><th>Status</th><th>Channel</th><th>Verified</th><th>Credits</th><th>Last active</th></tr></thead><tbody>{viewers.map((viewer) => <tr key={viewer.id}><td><strong>{viewer.name}</strong><small>{viewer.email}</small></td><td><span className={`stream-viewer-status stream-viewer-status-${viewer.status}`}>{viewer.status === "live" ? "Watching now" : "Ended"}</span></td><td>{viewer.channel}</td><td><strong>{(viewer.verifiedSeconds / 60).toFixed(1)} min</strong><small>{viewer.rejectedEvents} rejected</small></td><td><strong>+{viewer.earnedCredits.toFixed(3)}</strong><small>{viewer.consumedCredits.toFixed(3)} consumed</small></td><td>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(viewer.lastActivityAt))}</td></tr>)}</tbody></table></div> : <p className="business-stream-empty">No viewers match these filters.</p>}
    </div> : null}
  </section>;
}
