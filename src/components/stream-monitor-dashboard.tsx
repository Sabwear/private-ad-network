"use client";

import { Activity, AlertTriangle, BarChart3, CheckCircle2, CircleDollarSign, Clock3, Database, Eye, Gauge, Globe2, LoaderCircle, MapPin, Pause, RadioTower, RefreshCw, RotateCw, Search, Server, ShieldAlert, Signal, Square, UserRound, UsersRound, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { endMonitorViewerSession, handleMonitorChannel, type MonitorActionState } from "@/app/(platform)/monitor/actions";
import type { StreamMonitorChannel, StreamMonitorData, StreamMonitorSeriesPoint, StreamMonitorViewer } from "@/lib/repositories/stream-monitor";

const initialActionState: MonitorActionState = { status: "idle", message: "" };
const rangeOptions = [{ value: 1, label: "1h" }, { value: 6, label: "6h" }, { value: 24, label: "24h" }, { value: 168, label: "7d" }] as const;

function formatDuration(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m ${value % 60}s`;
}

function formatBytes(bytes: number) {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index > 2 ? 2 : 1)} ${units[index]}`;
}

function formatDate(value: string, includeDate = false) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", includeDate ? { dateStyle: "medium", timeStyle: "short" } : { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function locationLabel(value: { city?: string | null; regionCode?: string | null; countryCode?: string | null }) {
  return [value.city, value.regionCode, value.countryCode].filter(Boolean).join(", ") || "Location unavailable";
}

function LineChart({ points }: { points: StreamMonitorSeriesPoint[] }) {
  const width = 720; const height = 190; const padding = 18;
  const max = Math.max(1, ...points.map((point) => Math.max(point.concurrentViewers, point.viewerStarts)));
  const coordinates = (key: "concurrentViewers" | "viewerStarts") => points.map((point, index) => {
    const x = padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
    const y = height - padding - (point[key] / max) * (height - padding * 2);
    return `${x},${y}`;
  }).join(" ");
  const includeDate = points.length > 1 && Date.parse(points.at(-1)!.at) - Date.parse(points[0].at) >= 21_600_000;
  return <div className="monitor-chart-wrap"><svg className="monitor-line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Concurrent viewers and new viewer sessions over time">
    <defs><linearGradient id="viewerArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#159f90" stopOpacity=".28" /><stop offset="1" stopColor="#159f90" stopOpacity="0" /></linearGradient></defs>
    {[0, 1, 2, 3].map((line) => <line key={line} x1={padding} x2={width - padding} y1={padding + line * ((height - padding * 2) / 3)} y2={padding + line * ((height - padding * 2) / 3)} className="monitor-chart-grid" />)}
    {points.length ? <polygon points={`${padding},${height - padding} ${coordinates("concurrentViewers")} ${width - padding},${height - padding}`} fill="url(#viewerArea)" /> : null}
    <polyline points={coordinates("concurrentViewers")} className="monitor-chart-line monitor-chart-viewers" />
    <polyline points={coordinates("viewerStarts")} className="monitor-chart-line monitor-chart-starts" />
  </svg><div className="monitor-chart-axis"><span>{points[0] ? formatDate(points[0].at, includeDate) : "—"}</span><span>{points.at(-1) ? formatDate(points.at(-1)!.at, includeDate) : "—"}</span></div></div>;
}

function CreditChart({ points }: { points: StreamMonitorSeriesPoint[] }) {
  const max = Math.max(0.001, ...points.map((point) => Math.max(point.creditsSpent, point.creditsEarned)));
  return <div className="monitor-credit-chart" role="img" aria-label="Credits spent and earned over time">{points.map((point) => <div className="monitor-credit-column" key={point.at} title={`${formatDate(point.at)} · ${point.creditsSpent.toFixed(3)} spent · ${point.creditsEarned.toFixed(3)} earned`}><span className="monitor-credit-spent" style={{ height: point.creditsSpent ? `${Math.max(2, point.creditsSpent / max * 100)}%` : 0 }} /><span className="monitor-credit-earned" style={{ height: point.creditsEarned ? `${Math.max(2, point.creditsEarned / max * 100)}%` : 0 }} /></div>)}</div>;
}

function ChannelOperations({ channel }: { channel: StreamMonitorChannel }) {
  const [state, action, pending] = useActionState(handleMonitorChannel, initialActionState);
  const nextAction = channel.status === "active" && channel.broadcastEnabled ? "pause" : "resume";
  return <details className="monitor-handle"><summary>Handle</summary><form action={action}><input type="hidden" name="channelId" value={channel.id} /><label><span>Operation</span><select name="action" defaultValue={nextAction}><option value="pause">Pause channel</option><option value="resume">Resume channel</option><option value="restart">Restart broadcast clock</option></select></label><label><span>Reason</span><input name="reason" minLength={5} maxLength={300} required placeholder="Operational reason" /></label><button type="submit" disabled={pending}>{pending ? <LoaderCircle className="auth-spinner" size={14} /> : nextAction === "pause" ? <Pause size={14} /> : <RotateCw size={14} />}Apply and audit</button>{state.message ? <small className={`form-status-${state.status}`}>{state.message}</small> : null}</form></details>;
}

function ViewerOperations({ viewer }: { viewer: StreamMonitorViewer }) {
  const [state, action, pending] = useActionState(endMonitorViewerSession, initialActionState);
  if (!viewer.active) return null;
  return <details className="monitor-handle monitor-viewer-handle"><summary>End</summary><form action={action}><input type="hidden" name="sessionId" value={viewer.id} /><label><span>Reason</span><input name="reason" minLength={5} maxLength={300} required placeholder="Why end this session?" /></label><button type="submit" disabled={pending}>{pending ? <LoaderCircle className="auth-spinner" size={14} /> : <Square size={13} />}End and audit</button>{state.message ? <small className={`form-status-${state.status}`}>{state.message}</small> : null}</form></details>;
}

export function StreamMonitorDashboard({ data }: { data: StreamMonitorData }) {
  const router = useRouter();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [viewerSearch, setViewerSearch] = useState("");
  const [viewerChannel, setViewerChannel] = useState("all");
  const [liveOnly, setLiveOnly] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const rejectionRate = data.summary.heartbeatEvents ? data.summary.rejectedEvents / data.summary.heartbeatEvents * 100 : 0;
  const maxLocationSessions = Math.max(1, ...data.locations.map((location) => location.sessions));
  const healthyChannels = data.channels.filter((channel) => channel.status === "active" && channel.broadcastEnabled && channel.activeItems > 0).length;
  const sortedViewers = useMemo(() => {
    const term = viewerSearch.trim().toLowerCase();
    return data.viewers.filter((viewer) => {
      if (liveOnly && !viewer.active) return false;
      if (viewerChannel !== "all" && String(viewer.channelId) !== viewerChannel) return false;
      return !term || `${viewer.name} ${viewer.email ?? ""} ${viewer.city ?? ""} ${viewer.regionCode ?? ""} ${viewer.countryCode ?? ""}`.toLowerCase().includes(term);
    }).sort((a, b) => Number(b.active) - Number(a.active) || Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt));
  }, [data.viewers, liveOnly, viewerChannel, viewerSearch]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = window.setInterval(() => startRefresh(() => router.refresh()), 15_000);
    return () => window.clearInterval(interval);
  }, [autoRefresh, router]);

  function refresh() { startRefresh(() => router.refresh()); }

  return <div className="stream-monitor">
    <section className="monitor-toolbar"><div className="monitor-range" aria-label="Monitoring window">{rangeOptions.map((option) => <Link key={option.value} className={data.windowHours === option.value ? "active" : ""} href={`/operations?range=${option.value}#monitor`}>{option.label}</Link>)}</div><div className="monitor-refresh"><span><Signal size={14} /> Updated {formatDate(data.generatedAt)} · {autoRefresh ? "15s live refresh" : "Auto refresh paused"}</span><label><input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} /> Auto</label><button type="button" onClick={refresh} disabled={refreshing}>{refreshing ? <LoaderCircle className="auth-spinner" size={15} /> : <RefreshCw size={15} />}Refresh</button></div></section>

    {data.source !== "live" ? <section className="monitor-unavailable"><WifiOff size={24} /><div><strong>Stream telemetry is not active</strong><p>{data.message}</p></div></section> : null}

    <section className="monitor-metrics">
      <article><span className="monitor-metric-icon teal"><Eye size={19} /></span><div><small>Watching now</small><strong>{data.summary.activeViewers}</strong><p>{data.summary.registeredViewers} registered in window</p></div></article>
      <article><span className="monitor-metric-icon blue"><RadioTower size={19} /></span><div><small>Live channels</small><strong>{data.summary.liveChannels}/{data.summary.totalChannels}</strong><p>{healthyChannels} healthy with media</p></div></article>
      <article><span className="monitor-metric-icon purple"><Clock3 size={19} /></span><div><small>Verified watch time</small><strong>{(data.summary.verifiedSeconds / 60).toFixed(1)}m</strong><p>{formatDuration(data.summary.averageSessionSeconds)} average session</p></div></article>
      <article><span className="monitor-metric-icon orange"><CircleDollarSign size={19} /></span><div><small>Credit movement</small><strong>{data.summary.creditsSpent.toFixed(3)}</strong><p>{data.summary.creditsEarned.toFixed(3)} earned by hosts</p></div></article>
      <article><span className={`monitor-metric-icon ${rejectionRate >= 15 ? "red" : "teal"}`}><ShieldAlert size={19} /></span><div><small>Validation health</small><strong>{rejectionRate.toFixed(1)}%</strong><p>{data.summary.rejectedEvents} rejected of {data.summary.heartbeatEvents}</p></div></article>
      <article><span className={`monitor-metric-icon ${data.summary.accessFailures >= 20 ? "red" : "blue"}`}><Globe2 size={19} /></span><div><small>Access and reach</small><strong>{data.summary.countries} countries</strong><p>{data.summary.accessFailures} failed · {data.summary.accessSuccesses} accepted</p></div></article>
    </section>

    <section className="monitor-status-grid">
      <article className="panel monitor-system"><header><div><Server size={18} /><span><strong>Application runtime</strong><small>Current serving instance</small></span></div><span className="monitor-health good"><i /> Online</span></header><dl><div><dt>Environment</dt><dd>{data.runtime.environment}</dd></div><div><dt>Release</dt><dd>{data.runtime.version}</dd></div><div><dt>Instance uptime</dt><dd>{formatDuration(data.runtime.instanceUptimeSeconds)}</dd></div><div><dt>Memory</dt><dd>{data.runtime.memoryMegabytes.toFixed(1)} MB</dd></div></dl></article>
      <article className="panel monitor-system"><header><div><Database size={18} /><span><strong>Database service</strong><small>Live readiness probe</small></span></div><span className={`monitor-health ${data.database.status === "ready" ? "good" : "bad"}`}><i /> {data.database.status}</span></header><dl><div><dt>Query latency</dt><dd>{data.databaseLatencyMs} ms</dd></div><div><dt>Connections</dt><dd>{data.database.connections}</dd></div><div><dt>Database size</dt><dd>{formatBytes(data.database.databaseBytes)}</dd></div><div><dt>Postgres uptime</dt><dd>{data.database.startedAt ? formatDuration((Date.parse(data.generatedAt) - Date.parse(data.database.startedAt)) / 1000) : "—"}</dd></div></dl></article>
      <article className="panel monitor-incidents"><header><div><AlertTriangle size={18} /><span><strong>Operational alerts</strong><small>Automatic triage signals</small></span></div><b>{data.alerts.length}</b></header><div>{data.alerts.slice(0, 4).map((alert, index) => <div className={`monitor-alert monitor-alert-${alert.tone}`} key={`${alert.title}-${index}`}>{alert.tone === "info" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}<span><strong>{alert.title}</strong><small>{alert.detail}</small></span></div>)}</div></article>
    </section>

    <section className="monitor-chart-grid-layout">
      <article className="panel monitor-chart-card"><header><div><Activity size={18} /><span><strong>Audience activity</strong><small>Concurrent viewers and new sessions</small></span></div><div className="monitor-legend"><span className="viewers">Concurrent</span><span className="starts">Starts</span></div></header><LineChart points={data.series} /></article>
      <article className="panel monitor-chart-card"><header><div><BarChart3 size={18} /><span><strong>Credit velocity</strong><small>Per monitoring interval</small></span></div><div className="monitor-legend"><span className="spent">Spent</span><span className="earned">Earned</span></div></header><CreditChart points={data.series} /><footer><span><strong>{data.summary.creditsSpent.toFixed(3)}</strong> spent</span><span><strong>{data.summary.creditsEarned.toFixed(3)}</strong> earned</span></footer></article>
    </section>

    <section className="panel monitor-channels"><header className="monitor-section-header"><div><RadioTower size={18} /><span><strong>Channel operations</strong><small>Health, uptime, audience, playback, and audited handling</small></span></div><Link className="button button-secondary" href="/channels">Full configuration</Link></header><div className="table-scroll"><table><thead><tr><th>Channel</th><th>Health</th><th>Uptime</th><th>Audience</th><th>Verified</th><th>Credits</th><th>Handling</th></tr></thead><tbody>{data.channels.map((channel) => {
      const healthy = channel.status === "active" && channel.broadcastEnabled && channel.activeItems > 0;
      return <tr key={channel.id}><td><strong>{channel.name}</strong><small>{channel.businesses.join(", ") || "No business assigned"} · {channel.activeItems} media</small></td><td><span className={`monitor-health ${healthy ? "good" : "bad"}`}><i />{healthy ? "Healthy" : channel.status === "active" ? "Empty" : "Paused"}</span></td><td>{formatDuration(channel.uptimeSeconds)}</td><td><strong>{channel.activeViewers} live</strong><small>{channel.sessions} sessions</small></td><td><strong>{(channel.verifiedSeconds / 60).toFixed(1)} min</strong><small>{channel.rejectedEvents} rejected</small></td><td><strong>{channel.creditsSpent.toFixed(3)} spent</strong><small>{channel.creditsEarned.toFixed(3)} earned</small></td><td><div className="monitor-row-actions"><Link href={`/stream/${channel.publicId}/${channel.accessKey}`} target="_blank"><Eye size={13} />Open</Link><ChannelOperations channel={channel} /></div></td></tr>;
    })}</tbody></table></div></section>

    <section className="monitor-detail-grid">
      <article className="panel monitor-locations"><header className="monitor-section-header"><div><MapPin size={18} /><span><strong>Viewer locations</strong><small>Coarse edge-derived geography; no raw IP storage</small></span></div><b>{data.locations.length}</b></header><div className="monitor-location-list">{data.locations.slice(0, 12).map((location) => <div key={`${location.countryCode}-${location.regionCode}-${location.city}`}><span><strong>{locationLabel(location)}</strong><small>{location.activeViewers} live · {location.sessions} sessions</small></span><div><i style={{ width: `${location.sessions / maxLocationSessions * 100}%` }} /></div></div>)}{!data.locations.length ? <p>No viewer geography has been recorded in this window.</p> : null}</div></article>
      <article className="panel monitor-validation"><header className="monitor-section-header"><div><Gauge size={18} /><span><strong>Validation failures</strong><small>Latest rejected or unfunded playback events</small></span></div><b>{data.failures.length}</b></header><div className="monitor-failure-list">{data.failures.slice(0, 10).map((failure) => <div key={failure.id}><span className={`monitor-failure-icon ${failure.result === "insufficient_credit" ? "orange" : "red"}`}><ShieldAlert size={15} /></span><span><strong>{failure.reasons.join(", ").replaceAll("_", " ") || failure.result}</strong><small>{failure.channel} · {failure.asset} · {locationLabel(failure)} · {formatDate(failure.createdAt, true)}</small></span></div>)}{!data.failures.length ? <p>No validation failures in this window.</p> : null}</div></article>
    </section>

    <section className="panel monitor-viewers"><header className="monitor-section-header"><div><UsersRound size={18} /><span><strong>Viewer sessions</strong><small>Live viewers first, followed by recent activity</small></span></div><b>{sortedViewers.length}</b></header><div className="monitor-viewer-filters"><label className="monitor-viewer-search"><Search size={14} /><input aria-label="Search viewer sessions" value={viewerSearch} onChange={(event) => setViewerSearch(event.target.value)} placeholder="Search viewer or location" /></label><label><span>Channel</span><select value={viewerChannel} onChange={(event) => setViewerChannel(event.target.value)}><option value="all">All channels</option>{data.channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</select></label><label className="monitor-live-filter"><input type="checkbox" checked={liveOnly} onChange={(event) => setLiveOnly(event.target.checked)} /> Watching now only</label></div><div className="table-scroll"><table><thead><tr><th>Viewer</th><th>Status</th><th>Location</th><th>Channel</th><th>Uptime</th><th>Playback</th><th>Credits</th><th /></tr></thead><tbody>{sortedViewers.map((viewer) => <tr key={viewer.id}><td><div className="monitor-viewer-name"><span><UserRound size={15} /></span><div><strong>{viewer.name}</strong><small>{viewer.email ?? `${viewer.device} · ${viewer.browser}`}</small></div></div></td><td><span className={`monitor-health ${viewer.active ? "good" : "neutral"}`}><i />{viewer.active ? "Watching" : "Ended"}</span><small>{formatDate(viewer.lastActivityAt)}</small></td><td><strong>{locationLabel(viewer)}</strong><small>{viewer.edgeColo ? `Edge ${viewer.edgeColo}` : "Edge unavailable"}</small></td><td>{viewer.channel}</td><td>{formatDuration(viewer.uptimeSeconds)}</td><td><strong>{(viewer.verifiedSeconds / 60).toFixed(1)} min</strong><small>{viewer.rejectedEvents} rejected</small></td><td><strong>{viewer.creditsSpent.toFixed(3)} spent</strong><small>{viewer.creditsEarned.toFixed(3)} earned</small></td><td><ViewerOperations viewer={viewer} /></td></tr>)}{!sortedViewers.length ? <tr><td colSpan={8} className="monitor-empty-row">No viewer sessions match these filters.</td></tr> : null}</tbody></table></div></section>
  </div>;
}
