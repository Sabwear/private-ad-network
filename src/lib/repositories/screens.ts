import "server-only";

import { screens as demoScreens, type StatusTone } from "@/lib/platform-data";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type ScreenLocationOption = { id: number; name: string; organization: string };

export type ScreenInventoryItem = {
  id: string;
  name: string;
  location: string;
  status: string;
  current: string;
  heartbeat: string;
  uptime: string;
  risk: string;
  tone: StatusTone;
  deviceType: string;
  operatingSystem: string;
  browser: string;
  ipAddress: string;
  locale: string;
  timezone: string;
  display: string;
  network: string;
  region: string;
  edge: string;
  appVersion: string;
  keyFingerprint: string;
  observedAt: string;
  suspensionReason: string;
};

type ScreenSummary = {
  registered: number;
  locations: number;
  online: number;
  onlinePercent: number;
  needsAction: number;
};

export type ScreensResult = {
  source: "demo" | "supabase" | "setup";
  screens: ScreenInventoryItem[];
  locations: ScreenLocationOption[];
  summary: ScreenSummary;
};

const setupErrorCodes = new Set(["PGRST204", "PGRST205", "42501"]);

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function heartbeatLabel(value: string | null, now: number) {
  if (!value) return "Never";
  const elapsedSeconds = Math.max(0, Math.floor((now - new Date(value).getTime()) / 1000));
  if (elapsedSeconds < 60) return `${elapsedSeconds} sec ago`;
  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

function presentationForDevice(device: { activation_status: string; last_heartbeat_at: string | null; risk_state: string }, now: number) {
  if (device.activation_status === "pending") return { status: "Pairing", current: "Waiting for activation", tone: "warning" as StatusTone };
  if (device.activation_status === "suspended" || device.activation_status === "revoked") return { status: titleCase(device.activation_status), current: "Playback disabled", tone: "danger" as StatusTone };
  const heartbeatAge = device.last_heartbeat_at ? now - new Date(device.last_heartbeat_at).getTime() : Number.POSITIVE_INFINITY;
  if (heartbeatAge <= 120_000) return { status: "Online", current: "Ready for manifest", tone: device.risk_state === "low" ? "success" as StatusTone : "warning" as StatusTone };
  return { status: "Offline", current: "Last manifest cached", tone: "danger" as StatusTone };
}

function summarize(items: ScreenInventoryItem[]): ScreenSummary {
  const online = items.filter((item) => item.status === "Online").length;
  return {
    registered: items.length,
    locations: new Set(items.map((item) => item.location)).size,
    online,
    onlinePercent: items.length === 0 ? 0 : Math.round((online / items.length) * 1000) / 10,
    needsAction: items.filter((item) => item.status !== "Online" || item.risk !== "Low").length,
  };
}

function demoResult(): ScreensResult {
  const items = demoScreens.map((screen, index) => ({
    ...screen,
    id: `demo-${index}`,
    deviceType: "Preview device",
    operatingSystem: "-",
    browser: "-",
    ipAddress: "-",
    locale: "-",
    timezone: "-",
    display: "-",
    network: "-",
    region: "-",
    edge: "-",
    appVersion: "-",
    keyFingerprint: "-",
    observedAt: "-",
    suspensionReason: "",
  }));
  return { source: "demo", screens: items, locations: [], summary: summarize(items) };
}

export async function getScreens(): Promise<ScreensResult> {
  if (!hasSupabaseEnv()) return demoResult();
  const supabase = await createClient();
  const [organizationsResult, locationsResult, devicesResult, observationsResult] = await Promise.all([
    supabase.from("organizations").select("id,display_name").eq("status", "active"),
    supabase.from("locations").select("id,name,organization_id").eq("status", "active").order("name"),
    supabase.from("devices").select("id,public_id,location_id,name,activation_status,key_fingerprint,app_version,last_heartbeat_at,risk_state,suspension_reason").order("created_at", { ascending: false }),
    supabase.from("device_observations").select("device_id,observed_ip,device_type,os_name,browser_name,locale,timezone,screen_width,screen_height,device_pixel_ratio,connection_type,country_code,edge_colo,observed_at").order("observed_at", { ascending: false }).limit(500),
  ]);

  const error = organizationsResult.error ?? locationsResult.error ?? devicesResult.error ?? observationsResult.error;
  if (error) {
    if (setupErrorCodes.has(error.code)) return { source: "setup", screens: [], locations: [], summary: summarize([]) };
    throw new Error(`Unable to load screens: ${error.message}`);
  }

  const organizationNames = new Map((organizationsResult.data ?? []).map((organization) => [organization.id, organization.display_name]));
  const locations = (locationsResult.data ?? []).map((location) => ({
    id: location.id,
    name: location.name,
    organization: organizationNames.get(location.organization_id) ?? "Unknown organization",
  }));
  const locationNames = new Map(locations.map((location) => [location.id, `${location.organization} - ${location.name}`]));
  const latestObservationByDevice = new Map<number, NonNullable<typeof observationsResult.data>[number]>();
  for (const observation of observationsResult.data ?? []) {
    if (!latestObservationByDevice.has(observation.device_id)) latestObservationByDevice.set(observation.device_id, observation);
  }

  const now = Date.now();
  const items = (devicesResult.data ?? []).map((device) => {
    const presentation = presentationForDevice(device, now);
    const observation = latestObservationByDevice.get(device.id);
    const display = observation?.screen_width && observation.screen_height
      ? `${observation.screen_width} x ${observation.screen_height}${observation.device_pixel_ratio ? ` at ${observation.device_pixel_ratio}x` : ""}`
      : "Not reported";
    return {
      id: device.public_id,
      name: device.name,
      location: locationNames.get(device.location_id) ?? "Unknown location",
      status: presentation.status,
      current: presentation.current,
      heartbeat: heartbeatLabel(device.last_heartbeat_at, now),
      uptime: device.last_heartbeat_at ? "Telemetry active" : "Awaiting first heartbeat",
      risk: titleCase(device.risk_state),
      tone: presentation.tone,
      deviceType: observation?.device_type ? titleCase(observation.device_type) : "Not detected",
      operatingSystem: observation?.os_name ?? "Not detected",
      browser: observation?.browser_name ?? "Not detected",
      ipAddress: observation?.observed_ip ?? "Not reported",
      locale: observation?.locale ?? "Not reported",
      timezone: observation?.timezone ?? "Not reported",
      display,
      network: observation?.connection_type ?? "Not reported",
      region: observation?.country_code ?? "Not reported",
      edge: observation?.edge_colo ?? "Not reported",
      appVersion: device.app_version ?? "Not reported",
      keyFingerprint: device.key_fingerprint ?? "Not registered",
      observedAt: observation?.observed_at ?? "Never",
      suspensionReason: device.suspension_reason ?? "",
    };
  });

  return { source: "supabase", screens: items, locations, summary: summarize(items) };
}
