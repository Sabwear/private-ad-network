import "server-only";

import { hasSupabaseAdminEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type UserAdminRow = {
  id: string;
  email: string;
  name: string;
  accountStatus: string;
  platformRole: string;
  organizationId: number | null;
  organizationName: string;
  membershipRole: string | null;
  membershipStatus: string | null;
  emailVerifiedAt: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  liveSessionCount: number;
  sessionCount: number;
};

export type UserSessionRow = {
  id: string;
  userId: string;
  userName: string;
  email: string;
  device: string;
  browser: string;
  operatingSystem: string;
  ipAddress: string;
  location: string;
  lastPath: string;
  firstSeenAt: string;
  lastSeenAt: string;
  isLive: boolean;
  isRevoked: boolean;
};

export type UserAdminData = {
  source: "live" | "setup";
  accountCreationReady: boolean;
  users: UserAdminRow[];
  sessions: UserSessionRow[];
};

const setupErrorCodes = new Set(["PGRST205", "42501"]);
const liveWindowMs = 5 * 60 * 1000;

function clientDescription(userAgent: string | null) {
  const value = userAgent ?? "";
  const device = /iPad|Tablet/i.test(value) ? "Tablet" : /Mobile|Android|iPhone/i.test(value) ? "Mobile" : "Desktop";
  const browser = /Edg\//i.test(value) ? "Edge" : /Firefox\//i.test(value) ? "Firefox" : /Chrome\//i.test(value) ? "Chrome" : /Safari\//i.test(value) ? "Safari" : "Unknown browser";
  const operatingSystem = /Windows/i.test(value) ? "Windows" : /Android/i.test(value) ? "Android" : /iPhone|iPad|iOS/i.test(value) ? "iOS" : /Mac OS/i.test(value) ? "macOS" : /Linux/i.test(value) ? "Linux" : "Unknown OS";
  return { device, browser, operatingSystem };
}

export async function getUserAdminData(): Promise<UserAdminData> {
  const supabase = await createClient();
  const [profilesResult, membershipsResult, organizationsResult, sessionsResult] = await Promise.all([
    supabase.from("profiles").select("id,email,full_name,email_verified_at,account_status,platform_role,created_at").order("created_at", { ascending: false }),
    supabase.from("organization_memberships").select("organization_id,user_id,role,status,created_at").order("created_at", { ascending: true }),
    supabase.from("organizations").select("id,display_name"),
    supabase.from("user_activity_sessions").select("session_id,user_id,first_seen_at,last_seen_at,last_path,ip_address,user_agent,country_code,edge_colo,revoked_at").order("last_seen_at", { ascending: false }).limit(200),
  ]);

  const coreError = profilesResult.error ?? membershipsResult.error ?? organizationsResult.error;
  if (coreError) {
    if (setupErrorCodes.has(coreError.code)) return { source: "setup", accountCreationReady: hasSupabaseAdminEnv(), users: [], sessions: [] };
    throw new Error(`Unable to load user administration: ${coreError.message}`);
  }

  const sessionsAvailable = !sessionsResult.error;
  if (sessionsResult.error && !setupErrorCodes.has(sessionsResult.error.code)) {
    throw new Error(`Unable to load user sessions: ${sessionsResult.error.message}`);
  }

  const now = Date.now();
  const profiles = profilesResult.data ?? [];
  const memberships = membershipsResult.data ?? [];
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const organizationById = new Map((organizationsResult.data ?? []).map((organization) => [organization.id, organization.display_name]));
  const membershipByUser = new Map<string, (typeof memberships)[number]>();
  for (const membership of memberships) {
    if (!membershipByUser.has(membership.user_id)) membershipByUser.set(membership.user_id, membership);
  }

  const sessionCounts = new Map<string, { total: number; live: number; lastSeenAt: string | null }>();
  const sessions: UserSessionRow[] = (sessionsResult.data ?? []).map((session) => {
    const profile = profileById.get(session.user_id);
    const client = clientDescription(session.user_agent);
    const isLive = session.revoked_at === null && now - new Date(session.last_seen_at).getTime() <= liveWindowMs;
    const counts = sessionCounts.get(session.user_id) ?? { total: 0, live: 0, lastSeenAt: null };
    counts.total += 1;
    counts.live += isLive ? 1 : 0;
    if (!counts.lastSeenAt || session.last_seen_at > counts.lastSeenAt) counts.lastSeenAt = session.last_seen_at;
    sessionCounts.set(session.user_id, counts);
    return {
      id: session.session_id,
      userId: session.user_id,
      userName: profile?.full_name ?? "Account holder",
      email: profile?.email ?? "Unknown account",
      ...client,
      ipAddress: session.ip_address ?? "Not available",
      location: [session.country_code, session.edge_colo].filter(Boolean).join(" / ") || "Not available",
      lastPath: session.last_path ?? "Not recorded",
      firstSeenAt: session.first_seen_at,
      lastSeenAt: session.last_seen_at,
      isLive,
      isRevoked: session.revoked_at !== null,
    };
  });

  return {
    source: sessionsAvailable ? "live" : "setup",
    accountCreationReady: hasSupabaseAdminEnv(),
    users: profiles.map((profile) => {
      const membership = membershipByUser.get(profile.id);
      const counts = sessionCounts.get(profile.id);
      return {
        id: profile.id,
        email: profile.email,
        name: profile.full_name ?? "Account holder",
        accountStatus: profile.account_status,
        platformRole: profile.platform_role,
        organizationId: membership?.organization_id ?? null,
        organizationName: membership ? organizationById.get(membership.organization_id) ?? "Unknown business" : "Not assigned",
        membershipRole: membership?.role ?? null,
        membershipStatus: membership?.status ?? null,
        emailVerifiedAt: profile.email_verified_at,
        createdAt: profile.created_at,
        lastSeenAt: counts?.lastSeenAt ?? null,
        liveSessionCount: counts?.live ?? 0,
        sessionCount: counts?.total ?? 0,
      };
    }),
    sessions,
  };
}
