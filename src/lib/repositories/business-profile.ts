import "server-only";

import { getWorkspaceContext } from "@/lib/auth/workspace";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type StreamReportFilters = {
  mode?: "all" | "anonymous" | "registered";
  activity?: "all" | "live" | "ended";
  channelId?: number | null;
};

type StreamSummary = {
  totalSessions: number;
  activeSessions: number;
  registeredSessions: number;
  uniqueRegisteredViewers: number;
  anonymousSessions: number;
  verifiedSeconds: number;
  earnedCredits: number;
  consumedCredits: number;
  rejectedEvents: number;
  insufficientCreditEvents: number;
};

const emptySummary: StreamSummary = { totalSessions: 0, activeSessions: 0, registeredSessions: 0, uniqueRegisteredViewers: 0, anonymousSessions: 0, verifiedSeconds: 0, earnedCredits: 0, consumedCredits: 0, rejectedEvents: 0, insufficientCreditEvents: 0 };

function numericSummary(value: unknown): StreamSummary {
  if (!value || typeof value !== "object") return emptySummary;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(emptySummary).map((key) => [key, Number(record[key] ?? 0)])) as StreamSummary;
}

export async function getBusinessStreamProfile(filters: StreamReportFilters = {}, maxSessions = 200) {
  const workspace = await getWorkspaceContext();
  if (!workspace.organization.id) return null;

  const supabase = await createClient();
  const [organizationResult, assignmentsResult, rotationsResult] = await Promise.all([
    supabase.from("organizations").select("id,display_name,stream_access_code,stream_access_code_expires_at,stream_earning_enabled,stream_earning_rate,ad_consumption_rate").eq("id", workspace.organization.id).single(),
    supabase.from("streaming_channel_organizations").select("channel_id").eq("organization_id", workspace.organization.id),
    supabase.from("stream_access_code_rotations").select("rotated_at,expires_at").eq("organization_id", workspace.organization.id).order("rotated_at", { ascending: false }).limit(10),
  ]);
  if (organizationResult.error || !organizationResult.data) return null;

  const channelIds = (assignmentsResult.data ?? []).map((assignment) => assignment.channel_id);
  const [{ data: channels }, { data: summaryData }] = await Promise.all([
    channelIds.length ? supabase.from("streaming_channels").select("id,public_id,access_key,name").in("id", channelIds).order("name") : Promise.resolve({ data: [] }),
    supabase.rpc("get_stream_report_summary", { p_organization_id: workspace.organization.id }),
  ]);

  const admin = createAdminClient();
  let sessionsQuery = admin
    .from("stream_viewer_sessions")
    .select("id,channel_id,viewer_mode,viewer_name,viewer_email,created_at,last_activity_at,expires_at,ended_at,personal_data_purged_at")
    .eq("host_organization_id", workspace.organization.id)
    .order("last_activity_at", { ascending: false });
  if (filters.mode && filters.mode !== "all") sessionsQuery = sessionsQuery.eq("viewer_mode", filters.mode);
  if (filters.channelId) sessionsQuery = sessionsQuery.eq("channel_id", filters.channelId);
  const { data: unfilteredSessions } = await sessionsQuery.limit(Math.min(Math.max(maxSessions, 1), 5000));
  const liveCutoff = Date.now() - 60_000;
  const sessions = (unfilteredSessions ?? []).filter((session) => {
    const isLive = session.ended_at === null && new Date(session.expires_at).getTime() > Date.now() && new Date(session.last_activity_at).getTime() >= liveCutoff;
    if (filters.activity === "live") return isLive;
    if (filters.activity === "ended") return !isLive;
    return true;
  });
  const sessionIds = sessions.map((session) => session.id);
  const { data: creditEvents } = sessionIds.length ? await admin
    .from("stream_credit_events")
    .select("viewer_session_id,verified_seconds,earned_credits,consumed_credits,validation_result")
    .in("viewer_session_id", sessionIds)
    .limit(20_000) : { data: [] };
  const creditBySession = new Map<string, { verifiedSeconds: number; earnedCredits: number; consumedCredits: number; rejectedEvents: number }>();
  for (const event of creditEvents ?? []) {
    const current = creditBySession.get(event.viewer_session_id) ?? { verifiedSeconds: 0, earnedCredits: 0, consumedCredits: 0, rejectedEvents: 0 };
    current.verifiedSeconds += Number(event.verified_seconds);
    current.earnedCredits += Number(event.earned_credits);
    current.consumedCredits += Number(event.consumed_credits);
    current.rejectedEvents += event.validation_result === "accepted" ? 0 : 1;
    creditBySession.set(event.viewer_session_id, current);
  }
  const channelNames = new Map((channels ?? []).map((channel) => [channel.id, channel.name]));
  const organization = organizationResult.data;
  return {
    organizationId: organization.id,
    organizationName: organization.display_name,
    accessCode: organization.stream_access_code,
    accessCodeExpiresAt: organization.stream_access_code_expires_at,
    earningEnabled: organization.stream_earning_enabled,
    earningRate: organization.stream_earning_rate,
    consumptionRate: organization.ad_consumption_rate,
    channels: (channels ?? []).map((channel) => ({ id: channel.id, name: channel.name, href: `/stream/${channel.public_id}/${channel.access_key}` })),
    summary: numericSummary(summaryData),
    filters,
    rotations: (rotationsResult.data ?? []).map((rotation) => ({ rotatedAt: rotation.rotated_at, expiresAt: rotation.expires_at })),
    viewers: sessions.map((session) => ({
      id: session.id,
      mode: session.viewer_mode,
      name: session.personal_data_purged_at ? "Retained anonymous record" : session.viewer_mode === "registered" ? session.viewer_name ?? "Registered viewer" : "Anonymous viewer",
      email: session.personal_data_purged_at ? "Personal data removed" : session.viewer_mode === "registered" ? session.viewer_email ?? "—" : "Identity not collected",
      channel: channelNames.get(session.channel_id) ?? "Channel",
      createdAt: session.created_at,
      lastActivityAt: session.last_activity_at,
      status: session.ended_at === null && new Date(session.expires_at).getTime() > Date.now() && new Date(session.last_activity_at).getTime() >= liveCutoff ? "live" : "ended",
      ...(creditBySession.get(session.id) ?? { verifiedSeconds: 0, earnedCredits: 0, consumedCredits: 0, rejectedEvents: 0 }),
    })),
  };
}
