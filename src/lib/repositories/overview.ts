import "server-only";

import type { StatusTone } from "@/lib/platform-data";
import { createClient } from "@/lib/supabase/server";

export type PlaybackActivity = {
  id: string;
  asset: string;
  host: string;
  received: string;
  result: string;
  verifiedSeconds: number;
  tone: StatusTone;
};

export type PlaybackOverview = {
  source: "supabase" | "setup";
  acceptedCount: number;
  totalCount: number;
  heldCount: number;
  acceptanceRate: number | null;
  deliverySeries: number[];
  playsByCampaign: Map<string, number>;
  latest: PlaybackActivity[];
};

const setupCodes = new Set(["PGRST204", "PGRST205", "42501"]);

function emptyOverview(source: PlaybackOverview["source"]): PlaybackOverview {
  return {
    source,
    acceptedCount: 0,
    totalCount: 0,
    heldCount: 0,
    acceptanceRate: null,
    deliverySeries: Array.from({ length: 14 }, () => 0),
    playsByCampaign: new Map(),
    latest: [],
  };
}

function resultTone(result: string): StatusTone {
  if (result === "accepted") return "success";
  if (result === "held" || result === "pending") return "warning";
  if (result === "rejected" || result === "reversed") return "danger";
  return "neutral";
}

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export async function getPlaybackOverview(): Promise<PlaybackOverview> {
  const supabase = await createClient();
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 13));
  const startIso = start.toISOString();

  const [seriesResult, acceptedResult, totalResult, heldResult, latestResult] = await Promise.all([
    supabase.from("playback_sessions").select("campaign_id,validation_result,created_at").gte("created_at", startIso).order("created_at").limit(5000),
    supabase.from("playback_sessions").select("id", { count: "exact", head: true }).eq("validation_result", "accepted").gte("created_at", startIso),
    supabase.from("playback_sessions").select("id", { count: "exact", head: true }).gte("created_at", startIso),
    supabase.from("playback_sessions").select("id", { count: "exact", head: true }).eq("validation_result", "held"),
    supabase.from("playback_sessions").select("playback_id,campaign_id,media_asset_id,host_organization_id,verified_seconds,validation_result,created_at").order("created_at", { ascending: false }).limit(3),
  ]);

  const error = seriesResult.error ?? acceptedResult.error ?? totalResult.error ?? heldResult.error ?? latestResult.error;
  if (error) {
    if (setupCodes.has(error.code)) return emptyOverview("setup");
    throw new Error(`Unable to load playback overview: ${error.message}`);
  }

  const series = Array.from({ length: 14 }, () => 0);
  const acceptedByCampaignId = new Map<number, number>();
  for (const session of seriesResult.data ?? []) {
    if (session.validation_result !== "accepted") continue;
    const dayIndex = Math.floor((Date.parse(session.created_at.slice(0, 10) + "T00:00:00.000Z") - start.getTime()) / 86_400_000);
    if (dayIndex >= 0 && dayIndex < series.length) series[dayIndex] += 1;
    acceptedByCampaignId.set(session.campaign_id, (acceptedByCampaignId.get(session.campaign_id) ?? 0) + 1);
  }

  const latest = latestResult.data ?? [];
  const campaignIds = [...new Set([...acceptedByCampaignId.keys(), ...latest.map((session) => session.campaign_id)])];
  const assetIds = [...new Set(latest.map((session) => session.media_asset_id))];
  const organizationIds = [...new Set(latest.map((session) => session.host_organization_id))];
  const [campaignResult, assetResult, organizationResult] = await Promise.all([
    campaignIds.length ? supabase.from("campaigns").select("id,public_id").in("id", campaignIds) : Promise.resolve({ data: [], error: null }),
    assetIds.length ? supabase.from("media_assets").select("id,name").in("id", assetIds) : Promise.resolve({ data: [], error: null }),
    organizationIds.length ? supabase.from("organizations").select("id,display_name").in("id", organizationIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (campaignResult.error || assetResult.error || organizationResult.error) throw new Error("Unable to load playback activity details.");

  const campaignPublicIds = new Map((campaignResult.data ?? []).map((campaign) => [campaign.id, campaign.public_id]));
  const assetNames = new Map((assetResult.data ?? []).map((asset) => [asset.id, asset.name]));
  const organizationNames = new Map((organizationResult.data ?? []).map((organization) => [organization.id, organization.display_name]));
  const playsByCampaign = new Map<string, number>();
  for (const [campaignId, count] of acceptedByCampaignId) {
    const publicId = campaignPublicIds.get(campaignId);
    if (publicId) playsByCampaign.set(publicId, count);
  }

  const acceptedCount = acceptedResult.count ?? 0;
  const totalCount = totalResult.count ?? 0;
  return {
    source: "supabase",
    acceptedCount,
    totalCount,
    heldCount: heldResult.count ?? 0,
    acceptanceRate: totalCount === 0 ? null : Math.round((acceptedCount / totalCount) * 1000) / 10,
    deliverySeries: series,
    playsByCampaign,
    latest: latest.map((session) => ({
      id: session.playback_id,
      asset: assetNames.get(session.media_asset_id) ?? "Media asset",
      host: organizationNames.get(session.host_organization_id) ?? "Host business",
      received: new Date(session.created_at).toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
      result: titleCase(session.validation_result),
      verifiedSeconds: Number(session.verified_seconds),
      tone: resultTone(session.validation_result),
    })),
  };
}
