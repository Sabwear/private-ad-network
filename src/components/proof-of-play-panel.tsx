import { BadgeCheck, CircleDollarSign, Clock3, ShieldCheck } from "lucide-react";
import type { ProofOfPlayData } from "@/lib/repositories/stream-monitor";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function ProofOfPlayPanel({ data }: { data: ProofOfPlayData }) {
  const verifiedSeconds = data.events.reduce((total, event) => total + event.verifiedSeconds, 0);
  const consumed = data.events.reduce((total, event) => total + event.consumedCredits, 0);
  const peakEvents = data.events.filter((event) => event.busyMultiplier > 1).length;

  return <section id="proof" className="workspace-section-anchor monitor-proof-section">
    <div className="section-heading"><div><p className="eyebrow">Delivery evidence</p><h2>Proof of play</h2><p>Accepted, idempotent playback heartbeats with advertiser charges, host attribution, and applied busy-hour pricing.</p></div></div>
    <div className="proof-summary">
      <article className="proof-card accepted"><span><BadgeCheck size={20} /></span><div><strong>{data.events.length}</strong><p>accepted proof events</p></div></article>
      <article className="proof-card integrity"><span><Clock3 size={20} /></span><div><strong>{(verifiedSeconds / 60).toFixed(1)}m</strong><p>verified playback</p></div></article>
      <article className="proof-card held"><span><CircleDollarSign size={20} /></span><div><strong>{consumed.toFixed(3)}</strong><p>credits consumed</p></div></article>
      <article className="proof-card accepted"><span><ShieldCheck size={20} /></span><div><strong>{peakEvents}</strong><p>busy-hour proofs</p></div></article>
    </div>
    <article className="panel monitor-proof-table"><header className="monitor-section-header"><div><ShieldCheck size={18} /><span><strong>Recent accepted evidence</strong><small>Latest 50 events in the selected monitor window</small></span></div><b>{data.events.length}</b></header>
      {data.source !== "live" ? <p className="monitor-empty-row">Deploy the proof and busy-hours migration to collect evidence.</p> : <div className="table-scroll"><table><thead><tr><th>Time / proof ID</th><th>Channel & media</th><th>Advertiser</th><th>Host venue</th><th>Verified</th><th>Busy rate</th><th>Credits</th></tr></thead><tbody>{data.events.map((event) => <tr key={event.eventKey}><td><strong>{formatDate(event.createdAt)}</strong><small>{event.eventKey.slice(0, 13)}…</small></td><td><strong>{event.channel}</strong><small>{event.asset}</small></td><td>{event.advertiser}</td><td>{event.host}</td><td>{event.verifiedSeconds.toFixed(1)}s</td><td><span className={`busy-multiplier ${event.busyMultiplier > 1 ? "active" : ""}`}>{event.busyMultiplier.toFixed(2)}×</span></td><td><strong>{event.consumedCredits.toFixed(4)} spent</strong><small>{event.earnedCredits.toFixed(4)} earned</small></td></tr>)}</tbody></table></div>}
      {data.source === "live" && !data.events.length ? <p className="monitor-empty-row">No accepted playback evidence in this window.</p> : null}
    </article>
  </section>;
}
