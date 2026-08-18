import "server-only";

import { getWorkspaceContext } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";

export type MonitorRange = 1 | 6 | 24 | 168;

export type StreamMonitorSeriesPoint = {
  at: string;
  viewerStarts: number;
  concurrentViewers: number;
  verifiedSeconds: number;
  creditsSpent: number;
  creditsEarned: number;
  rejectedEvents: number;
};

export type StreamMonitorChannel = {
  id: number;
  publicId: string;
  accessKey: string;
  name: string;
  status: string;
  broadcastEnabled: boolean;
  broadcastStartedAt: string;
  uptimeSeconds: number;
  activeItems: number;
  businesses: string[];
  activeViewers: number;
  sessions: number;
  verifiedSeconds: number;
  creditsSpent: number;
  creditsEarned: number;
  rejectedEvents: number;
};

export type StreamMonitorViewer = {
  id: string;
  channelId: number;
  channel: string;
  mode: string;
  name: string;
  email: string | null;
  countryCode: string | null;
  regionCode: string | null;
  city: string | null;
  edgeColo: string | null;
  device: string;
  browser: string;
  startedAt: string;
  lastActivityAt: string;
  endedAt: string | null;
  expiresAt: string;
  active: boolean;
  uptimeSeconds: number;
  verifiedSeconds: number;
  creditsSpent: number;
  creditsEarned: number;
  rejectedEvents: number;
};

export type StreamMonitorData = {
  source: "live" | "setup" | "error";
  generatedAt: string;
  windowHours: MonitorRange;
  databaseLatencyMs: number;
  database: { status: string; serverVersion: string; startedAt: string; databaseBytes: number; connections: number };
  runtime: { status: string; environment: string; version: string; instanceUptimeSeconds: number; memoryMegabytes: number };
  summary: {
    activeViewers: number;
    registeredViewers: number;
    sessions: number;
    liveChannels: number;
    totalChannels: number;
    verifiedSeconds: number;
    creditsSpent: number;
    creditsEarned: number;
    heartbeatEvents: number;
    rejectedEvents: number;
    accessFailures: number;
    accessSuccesses: number;
    countries: number;
    averageSessionSeconds: number;
  };
  series: StreamMonitorSeriesPoint[];
  channels: StreamMonitorChannel[];
  locations: Array<{ countryCode: string; regionCode: string; city: string; sessions: number; activeViewers: number }>;
  viewers: StreamMonitorViewer[];
  failures: Array<{ id: number; createdAt: string; result: string; reasons: string[]; channel: string; asset: string; viewerSessionId: string; countryCode: string | null; city: string | null }>;
  alerts: Array<{ tone: "danger" | "warning" | "info"; title: string; detail: string }>;
  message: string | null;
};

const emptySummary: StreamMonitorData["summary"] = {
  activeViewers: 0, registeredViewers: 0, sessions: 0, liveChannels: 0,
  totalChannels: 0, verifiedSeconds: 0, creditsSpent: 0, creditsEarned: 0,
  heartbeatEvents: 0, rejectedEvents: 0, accessFailures: 0, accessSuccesses: 0,
  countries: 0, averageSessionSeconds: 0,
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function text(value: unknown, fallback = "") { return typeof value === "string" ? value : fallback; }
function numeric(value: unknown) { const next = Number(value ?? 0); return Number.isFinite(next) ? next : 0; }
function boolean(value: unknown) { return value === true; }

function parseUserAgent(userAgent: string) {
  const device = /iPad|Tablet|PlayBook/i.test(userAgent) ? "Tablet" : /Mobile|Android|iPhone/i.test(userAgent) ? "Mobile" : "Desktop";
  const browser = /Edg\//.test(userAgent) ? "Edge" : /Firefox\//.test(userAgent) ? "Firefox" : /Chrome\//.test(userAgent) ? "Chrome" : /Safari\//.test(userAgent) ? "Safari" : "Other";
  return { device, browser };
}

function emptyMonitor(range: MonitorRange, source: "setup" | "error", message: string): StreamMonitorData {
  const memory = process.memoryUsage();
  return {
    source, generatedAt: new Date().toISOString(), windowHours: range, databaseLatencyMs: 0,
    database: { status: "unavailable", serverVersion: "—", startedAt: "", databaseBytes: 0, connections: 0 },
    runtime: { status: "online", environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "local", version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local", instanceUptimeSeconds: process.uptime(), memoryMegabytes: memory.rss / 1_048_576 },
    summary: emptySummary, series: [], channels: [], locations: [], viewers: [], failures: [],
    alerts: [{ tone: "danger", title: "Monitoring data unavailable", detail: message }], message,
  };
}

export async function getStreamMonitorData(range: MonitorRange): Promise<StreamMonitorData> {
  const workspace = await getWorkspaceContext();
  if (workspace.account.role !== "admin") return emptyMonitor(range, "error", "Platform administrator access is required.");

  const supabase = await createClient();
  const started = performance.now();
  const { data, error } = await supabase.rpc("get_stream_monitor_snapshot", { p_window_hours: range });
  const latency = Math.round(performance.now() - started);
  if (error || !data) {
    const setup = error?.code === "PGRST202" || error?.code === "42883";
    return emptyMonitor(range, setup ? "setup" : "error", setup ? "Deploy the stream operations monitor migration to activate live telemetry." : "The stream monitor could not reach the operational data service.");
  }

  const root = record(data);
  const summarySource = record(root.summary);
  const databaseSource = record(root.database);
  const summary = Object.fromEntries(Object.keys(emptySummary).map((key) => [key, numeric(summarySource[key])])) as StreamMonitorData["summary"];
  const channels: StreamMonitorChannel[] = list(root.channels).map((channel) => ({
    id: numeric(channel.id), publicId: text(channel.publicId), accessKey: text(channel.accessKey), name: text(channel.name, "Channel"),
    status: text(channel.status, "unknown"), broadcastEnabled: boolean(channel.broadcastEnabled), broadcastStartedAt: text(channel.broadcastStartedAt),
    uptimeSeconds: numeric(channel.uptimeSeconds), activeItems: numeric(channel.activeItems), businesses: Array.isArray(channel.businesses) ? channel.businesses.map((item) => text(item)).filter(Boolean) : [],
    activeViewers: numeric(channel.activeViewers), sessions: numeric(channel.sessions), verifiedSeconds: numeric(channel.verifiedSeconds),
    creditsSpent: numeric(channel.creditsSpent), creditsEarned: numeric(channel.creditsEarned), rejectedEvents: numeric(channel.rejectedEvents),
  }));
  const viewers: StreamMonitorViewer[] = list(root.viewers).map((viewer) => {
    const client = parseUserAgent(text(viewer.userAgent));
    return {
      id: text(viewer.id), channelId: numeric(viewer.channelId), channel: text(viewer.channel, "Channel"), mode: text(viewer.mode), name: text(viewer.name, "Viewer"),
      email: text(viewer.email) || null, countryCode: text(viewer.countryCode) || null, regionCode: text(viewer.regionCode) || null, city: text(viewer.city) || null,
      edgeColo: text(viewer.edgeColo) || null, device: client.device, browser: client.browser, startedAt: text(viewer.startedAt), lastActivityAt: text(viewer.lastActivityAt),
      endedAt: text(viewer.endedAt) || null, expiresAt: text(viewer.expiresAt), active: boolean(viewer.active), uptimeSeconds: numeric(viewer.uptimeSeconds),
      verifiedSeconds: numeric(viewer.verifiedSeconds), creditsSpent: numeric(viewer.creditsSpent), creditsEarned: numeric(viewer.creditsEarned), rejectedEvents: numeric(viewer.rejectedEvents),
    };
  });
  const series: StreamMonitorSeriesPoint[] = list(root.series).map((point) => ({
    at: text(point.at), viewerStarts: numeric(point.viewerStarts), concurrentViewers: numeric(point.concurrentViewers), verifiedSeconds: numeric(point.verifiedSeconds),
    creditsSpent: numeric(point.creditsSpent), creditsEarned: numeric(point.creditsEarned), rejectedEvents: numeric(point.rejectedEvents),
  }));
  const locations = list(root.locations).map((location) => ({ countryCode: text(location.countryCode, "Unknown"), regionCode: text(location.regionCode), city: text(location.city), sessions: numeric(location.sessions), activeViewers: numeric(location.activeViewers) }));
  const failures = list(root.failures).map((failure) => ({ id: numeric(failure.id), createdAt: text(failure.createdAt), result: text(failure.result), reasons: Array.isArray(failure.reasons) ? failure.reasons.map((reason) => text(reason)) : [], channel: text(failure.channel), asset: text(failure.asset), viewerSessionId: text(failure.viewerSessionId), countryCode: text(failure.countryCode) || null, city: text(failure.city) || null }));

  const alerts: StreamMonitorData["alerts"] = [];
  for (const channel of channels) {
    if (channel.status !== "active" || !channel.broadcastEnabled) alerts.push({ tone: "warning", title: `${channel.name} is paused`, detail: "Viewer playback and earning are stopped until an administrator resumes the channel." });
    else if (channel.activeItems === 0) alerts.push({ tone: "danger", title: `${channel.name} has no active media`, detail: "The broadcast clock is running but there is nothing eligible to play." });
    else if (channel.rejectedEvents > Math.max(5, channel.sessions * 3)) alerts.push({ tone: "warning", title: `${channel.name} has elevated validation failures`, detail: `${channel.rejectedEvents} playback heartbeats were rejected in this window.` });
  }
  const rejectionRate = summary.heartbeatEvents ? summary.rejectedEvents / summary.heartbeatEvents : 0;
  if (rejectionRate >= 0.15) alerts.push({ tone: "warning", title: "Heartbeat rejection rate is elevated", detail: `${(rejectionRate * 100).toFixed(1)}% of stream heartbeats need review.` });
  if (summary.accessFailures >= 20 && summary.accessFailures > summary.accessSuccesses * 2) alerts.push({ tone: "danger", title: "Repeated stream access failures", detail: `${summary.accessFailures} invalid code attempts were recorded in this window.` });
  if (!alerts.length) alerts.push({ tone: "info", title: "No active stream incidents", detail: "Channels, viewer validation, and access traffic are within the configured operating thresholds." });

  const memory = process.memoryUsage();
  return {
    source: "live", generatedAt: text(root.generatedAt, new Date().toISOString()), windowHours: range, databaseLatencyMs: latency,
    database: { status: text(databaseSource.status, "ready"), serverVersion: text(databaseSource.serverVersion), startedAt: text(databaseSource.startedAt), databaseBytes: numeric(databaseSource.databaseBytes), connections: numeric(databaseSource.connections) },
    runtime: { status: "online", environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "local", version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local", instanceUptimeSeconds: process.uptime(), memoryMegabytes: memory.rss / 1_048_576 },
    summary, series, channels, locations, viewers, failures, alerts, message: null,
  };
}
