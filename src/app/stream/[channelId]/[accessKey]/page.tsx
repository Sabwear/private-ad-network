import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChannelPlayer } from "@/components/channel-player";
import { getPublicChannelStream } from "@/lib/streaming/public-channel";

type Props = { params: Promise<{ channelId: string; accessKey: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { channelId, accessKey } = await params;
  const channel = await getPublicChannelStream(channelId, accessKey);
  return { title: channel ? channel.name : "Channel unavailable", robots: { index: false, follow: false } };
}

export default async function StreamPage({ params }: Props) {
  const { channelId, accessKey } = await params;
  const channel = await getPublicChannelStream(channelId, accessKey);
  if (!channel) notFound();
  return <ChannelPlayer channel={channel} />;
}
