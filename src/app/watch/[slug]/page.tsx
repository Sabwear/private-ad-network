import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ChannelPlayer } from "@/components/channel-player";
import { AnonymousStreamBootstrap } from "@/components/stream-access-gate";
import { isCurrentUserPlatformAdmin } from "@/lib/auth/optional-admin";
import { getChannelAccessBySlug } from "@/lib/streaming/channel-access";
import { getPublicChannelStream } from "@/lib/streaming/public-channel";
import { getApprovedStreamViewer, STREAM_VIEWER_COOKIE } from "@/lib/streaming/viewer-session";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const access = await getChannelAccessBySlug((await params).slug);
  return { title: access ? access.channel.name : "Channel unavailable", robots: { index: false, follow: false } };
}

export default async function CleanStreamPage({ params }: Props) {
  const access = await getChannelAccessBySlug((await params).slug);
  if (!access) notFound();
  const channelId = access.channel.public_id;
  const accessKey = access.channel.access_key;
  const viewerToken = (await cookies()).get(STREAM_VIEWER_COOKIE)?.value;
  const channel = viewerToken ? await getPublicChannelStream(channelId, accessKey, viewerToken) : null;
  if (!channel) return <AnonymousStreamBootstrap channelId={channelId} accessKey={accessKey} />;
  const [canAdminister, approvedViewer] = await Promise.all([isCurrentUserPlatformAdmin(), getApprovedStreamViewer()]);
  return <ChannelPlayer key={`${channel.broadcastStartedAt}:${JSON.stringify(channel.settings)}`} channel={channel} canAdminister={canAdminister} accessKey={accessKey} approvedViewer={approvedViewer} />;
}
