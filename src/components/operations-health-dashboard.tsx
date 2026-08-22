"use client";

import { Activity, AlertTriangle, Clock3, Database, Gauge, LoaderCircle, RadioTower, RefreshCw, Server, Signal, Wifi } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { StreamMonitorData, StreamQualityChannel } from "@/lib/repositories/stream-monitor";

type HealthTone = "good" | "warning" | "bad" | "neutral";

function formatDuration(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m ${value % 60}s`;
}

function bufferRatio(value: Pick<StreamQualityChannel, "bufferDurationMs" | "observedDurationMs">) {
  return value.observedDurationMs ? value.bufferDurationMs / value.observedDurationMs * 100 : 0;
}

function droppedFrameRatio(value: Pick<StreamQualityChannel, "droppedFrames" | "totalFrames">) {
  return value.totalFrames ? value.droppedFrames / value.totalFrames * 100 : 0;
}

function experienceHealth(value: Pick<StreamQualityChannel, "samples" | "averageStartupMs" | "averageHeartbeatRttMs" | "bufferDurationMs" | "observedDurationMs" | "droppedFrames" | "totalFrames"> & { available?: boolean }): { tone: HealthTone; label: string } {
  if (value.available === false) return { tone: "bad", label: "Unavailable" };
  if (!value.samples) return { tone: "neutral", label: "Awaiting data" };
  const buffering = bufferRatio(value);
  const dropped = droppedFrameRatio(value);
  if (buffering >= 10 || value.averageStartupMs >= 8000 || value.averageHeartbeatRttMs >= 2500 || dropped >= 5) return { tone: "bad", label: "Critical" };
  if (buffering >= 3 || value.averageStartupMs >= 3000 || value.averageHeartbeatRttMs >= 750 || dropped >= 2) return { tone: "warning", label: "Degraded" };
  return { tone: "good", label: "Healthy" };
}

function infrastructureHealth(data: StreamMonitorData): { tone: HealthTone; label: string } {
  if (data.source !== "live" || data.database.status !== "ready") return { tone: "bad", label: "Unavailable" };
  if (data.databaseLatencyMs >= 1000) return { tone: "bad", label: "Critical" };
  if (data.databaseLatencyMs >= 400) return { tone: "warning", label: "Degraded" };
  return { tone: "good", label: "Healthy" };
}

function statusClass(tone: HealthTone) {
  return tone === "warning" ? "warning" : tone;
}

export function OperationsHealthDashboard({ data }: { data: StreamMonitorData }) {
  const router = useRouter();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshing, startRefresh] = useTransition();
  const infrastructure = infrastructureHealth(data);
  const experience = experienceHealth(data.quality);
  const overall = infrastructure.tone === "bad" || experience.tone === "bad" ? { tone: "bad" as const, label: "Action needed" }
    : infrastructure.tone === "warning" || experience.tone === "warning" ? { tone: "warning" as const, label: "Degraded" }
      : experience.tone === "neutral" ? { tone: "neutral" as const, label: "Infrastructure healthy" } : { tone: "good" as const, label: "Healthy" };
  const buffering = bufferRatio(data.quality);
  const dropped = droppedFrameRatio(data.quality);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = window.setInterval(() => startRefresh(() => router.refresh()), 15_000);
    return () => window.clearInterval(interval);
  }, [autoRefresh, router]);

  return <div className="operations-health">
    <div className="operations-health-toolbar">
      <div><span className={`monitor-health ${statusClass(overall.tone)}`}><i /> {overall.label}</span><small><Signal size={13} /> Last server snapshot {new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(data.generatedAt))}</small></div>
      <div><label><input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} /> Auto-refresh every 15s</label><button type="button" onClick={() => startRefresh(() => router.refresh())} disabled={refreshing}>{refreshing ? <LoaderCircle className="auth-spinner" size={15} /> : <RefreshCw size={15} />} Refresh</button><Link href="/monitor?range=1#live">Open full monitor</Link></div>
    </div>

    {data.source !== "live" ? <div className="monitor-unavailable"><AlertTriangle size={22} /><div><strong>Server diagnostics are unavailable</strong><p>{data.message}</p></div></div> : null}

    <section className="monitor-metrics operations-health-metrics" aria-label="Server and playback health metrics">
      <article><span className="monitor-metric-icon teal"><Server size={19} /></span><div><small>Application instance</small><strong>{data.runtime.status === "online" ? "Serving" : data.runtime.status}</strong><p>{data.runtime.environment} · up {formatDuration(data.runtime.instanceUptimeSeconds)}</p></div></article>
      <article><span className={`monitor-metric-icon ${data.databaseLatencyMs >= 400 ? "red" : "blue"}`}><Database size={19} /></span><div><small>Database round-trip</small><strong>{data.databaseLatencyMs} ms</strong><p>{data.database.status} · {data.database.connections} connections</p></div></article>
      <article><span className={`monitor-metric-icon ${data.quality.averageHeartbeatRttMs >= 750 ? "red" : "purple"}`}><Wifi size={19} /></span><div><small>Stream API round-trip</small><strong>{data.quality.samples ? `${Math.round(data.quality.averageHeartbeatRttMs)} ms` : "No data"}</strong><p>Viewer → app → database → viewer</p></div></article>
      <article><span className={`monitor-metric-icon ${buffering >= 3 ? "red" : "orange"}`}><Activity size={19} /></span><div><small>Buffering ratio</small><strong>{data.quality.samples ? `${buffering.toFixed(2)}%` : "No data"}</strong><p>{data.quality.bufferEvents} stalls · {data.quality.affectedSessions} viewers affected</p></div></article>
      <article><span className={`monitor-metric-icon ${data.quality.averageStartupMs >= 3000 ? "red" : "teal"}`}><Clock3 size={19} /></span><div><small>Playback startup</small><strong>{data.quality.samples ? `${Math.round(data.quality.averageStartupMs)} ms` : "No data"}</strong><p>{data.quality.slowStarts} starts slower than 5s</p></div></article>
      <article><span className={`monitor-metric-icon ${dropped >= 2 ? "red" : "blue"}`}><Gauge size={19} /></span><div><small>Dropped frames</small><strong>{data.quality.totalFrames ? `${dropped.toFixed(2)}%` : "No data"}</strong><p>{data.quality.droppedFrames.toLocaleString()} of {data.quality.totalFrames.toLocaleString()} frames</p></div></article>
    </section>

    <section className="monitor-status-grid operations-system-grid">
      <article className="panel monitor-system"><header><div><Server size={18} /><span><strong>Hosting runtime</strong><small>The Next.js instance serving this request</small></span></div><span className={`monitor-health ${statusClass(infrastructure.tone)}`}><i /> {infrastructure.label}</span></header><dl><div><dt>Environment</dt><dd>{data.runtime.environment}</dd></div><div><dt>Release</dt><dd>{data.runtime.version}</dd></div><div><dt>Memory in use</dt><dd>{data.runtime.memoryMegabytes.toFixed(1)} MB</dd></div><div><dt>Instance uptime</dt><dd>{formatDuration(data.runtime.instanceUptimeSeconds)}</dd></div></dl></article>
      <article className="panel monitor-system"><header><div><Database size={18} /><span><strong>Server-side data service</strong><small>Live query and readiness result</small></span></div><span className={`monitor-health ${data.database.status === "ready" ? "good" : "bad"}`}><i /> {data.database.status}</span></header><dl><div><dt>Query round-trip</dt><dd>{data.databaseLatencyMs} ms</dd></div><div><dt>Connections</dt><dd>{data.database.connections}</dd></div><div><dt>Postgres version</dt><dd>{data.database.serverVersion || "—"}</dd></div><div><dt>Telemetry window</dt><dd>Last {data.windowHours}h</dd></div></dl></article>
      <article className="panel monitor-system"><header><div><RadioTower size={18} /><span><strong>Viewer experience</strong><small>Measured by active stream players</small></span></div><span className={`monitor-health ${statusClass(experience.tone)}`}><i /> {experience.label}</span></header><dl><div><dt>Quality samples</dt><dd>{data.quality.samples}</dd></div><div><dt>Buffer time</dt><dd>{(data.quality.bufferDurationMs / 1000).toFixed(1)} s</dd></div><div><dt>Observed playback</dt><dd>{formatDuration(data.quality.observedDurationMs / 1000)}</dd></div><div><dt>Active viewers</dt><dd>{data.summary.activeViewers}</dd></div></dl></article>
    </section>

    <section className="panel operations-channel-health"><header className="monitor-section-header"><div><Gauge size={18} /><span><strong>Channel experience diagnostics</strong><small>Per-channel startup, buffering, API delay, and rendering quality</small></span></div><b>{data.quality.channels.length}</b></header><div className="table-scroll"><table><thead><tr><th>Channel</th><th>Status</th><th>Startup</th><th>Buffering</th><th>API round-trip</th><th>Dropped frames</th><th>Affected viewers</th><th>Last sample</th></tr></thead><tbody>{data.quality.channels.map((channel) => {
      const status = experienceHealth(channel);
      return <tr key={channel.channelId}><td><strong>{channel.channel}</strong><small>{channel.samples} quality samples</small></td><td><span className={`monitor-health ${statusClass(status.tone)}`}><i /> {status.label}</span></td><td>{Math.round(channel.averageStartupMs)} ms</td><td><strong>{bufferRatio(channel).toFixed(2)}%</strong><small>{channel.bufferEvents} stalls</small></td><td>{Math.round(channel.averageHeartbeatRttMs)} ms</td><td>{channel.totalFrames ? `${droppedFrameRatio(channel).toFixed(2)}%` : "—"}</td><td>{channel.affectedSessions}</td><td>{new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date(channel.lastObservedAt))}</td></tr>;
    })}{!data.quality.channels.length ? <tr><td colSpan={8} className="monitor-empty-row">No player quality samples yet. Metrics appear after an active viewer sends a heartbeat.</td></tr> : null}</tbody></table></div></section>
    <p className="operations-health-note">Thresholds: degraded at ≥400 ms database delay, ≥750 ms stream API round-trip, ≥3% buffering, ≥3 s startup, or ≥2% dropped frames. Critical thresholds are shown in red. Browser connection estimates are diagnostic signals, not hosting-provider guarantees.</p>
  </div>;
}
