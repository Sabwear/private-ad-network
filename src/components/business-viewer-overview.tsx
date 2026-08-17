import { Eye, UserRoundCheck } from "lucide-react";
import { StatusPill } from "@/components/status-pill";
import type { StreamMonitorData } from "@/lib/repositories/stream-monitor";

function elapsed(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  return `${Math.floor(seconds / 3600)} hr ${Math.floor(seconds % 3600 / 60)} min`;
}

export function BusinessViewerOverview({ monitor }: { monitor: StreamMonitorData }) {
  return <section id="viewers" className="workspace-section-anchor business-network-section">
    <div className="section-heading"><div><p className="eyebrow">Audience</p><h2>Watching streams</h2><p>See active and recent viewers beside the businesses and screens they belong to operationally.</p></div><span className="management-count"><Eye size={16} /> {monitor.summary.activeViewers} watching now</span></div>
    <section className="mini-metric-grid">
      <div><span>Watching now</span><strong className="success-text">{monitor.summary.activeViewers}</strong><small>Active viewer sessions</small></div>
      <div><span>Registered viewers</span><strong>{monitor.summary.registeredViewers}</strong><small>Administrator-approved identities</small></div>
      <div><span>Total sessions</span><strong>{monitor.summary.sessions}</strong><small>Last {monitor.windowHours} hours</small></div>
      <div><span>Countries</span><strong>{monitor.summary.countries}</strong><small>Audience locations observed</small></div>
    </section>
    {monitor.viewers.length ? <section className="panel table-panel"><div className="panel-header"><div><h2>Viewer sessions</h2><p>Identity is shown only when the viewer chose registered access.</p></div></div><div className="table-scroll"><table><thead><tr><th>Viewer</th><th>Channel</th><th>Location</th><th>Device</th><th>Uptime</th><th>Status</th></tr></thead><tbody>{monitor.viewers.slice(0, 50).map((viewer) => <tr key={viewer.id}><td><strong>{viewer.name}</strong><small className="screen-table-detail">{viewer.email ?? viewer.mode}</small></td><td>{viewer.channel}</td><td>{[viewer.city, viewer.regionCode, viewer.countryCode].filter(Boolean).join(", ") || "Unknown"}</td><td>{viewer.device} · {viewer.browser}</td><td>{elapsed(viewer.uptimeSeconds)}</td><td><StatusPill tone={viewer.active ? "success" : "neutral"}>{viewer.active ? "Watching" : "Ended"}</StatusPill></td></tr>)}</tbody></table></div></section> : <section className="empty-state"><UserRoundCheck size={27} /><h2>No viewer sessions yet</h2><p>Anonymous and registered viewers will appear here when they open an active stream.</p></section>}
  </section>;
}
