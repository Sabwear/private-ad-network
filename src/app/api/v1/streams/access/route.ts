import { NextResponse } from "next/server";
import { z } from "zod";
import { getDeviceNetworkContext } from "@/lib/device/network-context";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createViewerToken,
  hashNetworkIdentifier,
  hashViewerToken,
  getApprovedStreamViewer,
  STREAM_VIEWER_COOKIE,
  STREAM_VIEWER_SESSION_SECONDS,
} from "@/lib/streaming/viewer-session";

const accessSchema = z.discriminatedUnion("mode", [
  z.object({
    channelId: z.string().uuid(),
    accessKey: z.string().uuid(),
    passcode: z.string().regex(/^\d{6}$/).optional(),
    mode: z.literal("anonymous"),
  }),
  z.object({
    channelId: z.string().uuid(),
    accessKey: z.string().uuid(),
    passcode: z.string().regex(/^\d{6}$/),
    mode: z.literal("registered"),
  }),
]);

const genericError = "The stream code is invalid or the channel is unavailable.";

export async function POST(request: Request) {
  const parsed = accessSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid six-digit code and viewer details." }, { status: 400 });

  const admin = createAdminClient();
  await admin.rpc("purge_expired_stream_viewer_data");
  const network = getDeviceNetworkContext(request);
  const ipHash = hashNetworkIdentifier(network.ipAddress || network.userAgent || "unknown");
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("stream_access_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .eq("succeeded", false)
    .gte("attempted_at", cutoff);
  if ((count ?? 0) >= 12) return NextResponse.json({ error: "Too many attempts. Wait 15 minutes and try again." }, { status: 429 });

  const { data: channel } = await admin
    .from("streaming_channels")
    .select("id,public_id")
    .eq("public_id", parsed.data.channelId)
    .eq("access_key", parsed.data.accessKey)
    .eq("status", "active")
    .maybeSingle();
  if (channel) {
    const { count: channelFailureCount } = await admin
      .from("stream_access_attempts")
      .select("id", { count: "exact", head: true })
      .eq("channel_public_id", channel.public_id)
      .eq("succeeded", false)
      .gte("attempted_at", cutoff);
    if ((channelFailureCount ?? 0) >= 60) return NextResponse.json({ error: "This channel is temporarily locked after repeated invalid code attempts." }, { status: 429 });
  }
  const passcode = parsed.data.passcode;
  const { data: organization } = channel && passcode ? await admin
    .from("organizations")
    .select("id")
    .eq("stream_access_code", passcode)
    .eq("status", "active")
    .gt("stream_access_code_expires_at", new Date().toISOString())
    .maybeSingle() : { data: null };
  const { data: assignment } = channel && organization ? await admin
    .from("streaming_channel_organizations")
    .select("channel_id")
    .eq("channel_id", channel.id)
    .eq("organization_id", organization.id)
    .maybeSingle() : { data: null };

  const attributed = Boolean(organization && assignment);
  const succeeded = Boolean(channel && (parsed.data.mode === "anonymous" && !passcode || attributed));
  await admin.from("stream_access_attempts").insert({
    ip_hash: ipHash,
    channel_public_id: channel?.public_id ?? null,
    succeeded,
  });
  if (!channel || (passcode && !attributed) || parsed.data.mode === "registered" && !attributed) {
    return NextResponse.json({ error: genericError }, { status: 403 });
  }

  const approvedViewer = parsed.data.mode === "registered" ? await getApprovedStreamViewer() : null;
  if (parsed.data.mode === "registered" && !approvedViewer) {
    return NextResponse.json({ error: "Sign in with an administrator-approved account to register your viewing." }, { status: 401 });
  }
  if (approvedViewer) {
    const activeCutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { count: activeSessionCount } = await admin
      .from("stream_viewer_sessions")
      .select("id", { count: "exact", head: true })
      .eq("viewer_user_id", approvedViewer.id)
      .is("ended_at", null)
      .gte("last_activity_at", activeCutoff);
    if ((activeSessionCount ?? 0) >= 3) return NextResponse.json({ error: "This account already has three active streams." }, { status: 429 });
  }

  const token = createViewerToken();
  const { error } = await admin.from("stream_viewer_sessions").insert({
    channel_id: channel.id,
    host_organization_id: organization?.id ?? null,
    token_hash: hashViewerToken(token),
    viewer_mode: parsed.data.mode,
    viewer_user_id: approvedViewer?.id ?? null,
    viewer_name: approvedViewer?.name ?? null,
    viewer_email: approvedViewer?.email ?? null,
    ip_hash: ipHash,
    user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
    country_code: network.countryCode || null,
    region_code: network.regionCode || null,
    city: network.city || null,
    edge_colo: network.edgeColo || null,
  });
  if (error) return NextResponse.json({ error: "Viewer access could not be started. Try again." }, { status: 500 });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(STREAM_VIEWER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: STREAM_VIEWER_SESSION_SECONDS,
  });
  return response;
}
