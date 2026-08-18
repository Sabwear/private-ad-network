import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ChannelPlayer } from "@/components/channel-player";
import { AnonymousStreamBootstrap } from "@/components/stream-access-gate";
import { getPublicChannelStream } from "@/lib/streaming/public-channel";
import { getChannelAccessPreview } from "@/lib/streaming/channel-access";
import { getApprovedStreamViewer, STREAM_VIEWER_COOKIE } from "@/lib/streaming/viewer-session";

type Props = { params: Promise<{ channelId: string; accessKey: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { channelId, accessKey } = await params;
  const access = await getChannelAccessPreview(channelId, accessKey);
  return { title: access ? access.channel.name : "Channel unavailable", robots: { index: false, follow: false } };
}

export default async function StreamPage({ params }: Props) {
  const { channelId, accessKey } = await params;
  const access = await getChannelAccessPreview(channelId, accessKey);
  if (!access) notFound();
  const viewerToken = (await cookies()).get(STREAM_VIEWER_COOKIE)?.value;
  const channel = viewerToken ? await getPublicChannelStream(channelId, accessKey, viewerToken) : null;
  if (!channel) {
    return <AnonymousStreamBootstrap channelId={channelId} accessKey={accessKey} />;
  }
  const approvedViewer = await getApprovedStreamViewer();
  return <ChannelPlayer key={`${channel.broadcastStartedAt}:${JSON.stringify(channel.settings)}`} channel={channel} accessKey={accessKey} approvedViewer={approvedViewer} />;
}
