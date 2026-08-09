import "server-only";

import { authorizeChannel } from "@/lib/streaming/channel-access";

export type PublicChannelStream = {
  name: string;
  description: string;
  items: Array<{ id: string; name: string; hlsUrl: string | null; fallbackUrl: string }>;
};

export async function getPublicChannelStream(channelPublicId: string, accessKey: string): Promise<PublicChannelStream | null> {
  const access = await authorizeChannel(channelPublicId, accessKey);
  if (!access) return null;
  const { data: items } = await access.admin.from("streaming_channel_items").select("media_asset_id,position").eq("channel_id", access.channel.id).eq("status", "active").order("position");
  const assetIds = (items ?? []).map((item) => item.media_asset_id);
  const { data: assets } = assetIds.length ? await access.admin.from("media_assets").select("id,public_id,name,hls_master_storage_path").in("id", assetIds).eq("moderation_status", "approved").eq("processing_status", "ready") : { data: [] };
  const assetsById = new Map((assets ?? []).map((asset) => [asset.id, asset]));
  return {
    name: access.channel.name,
    description: access.channel.description ?? "",
    items: (items ?? []).flatMap((item) => {
      const asset = assetsById.get(item.media_asset_id);
      if (!asset) return [];
      const base = `/api/v1/channels/${channelPublicId}`;
      return [{
        id: asset.public_id,
        name: asset.name,
        hlsUrl: asset.hls_master_storage_path ? `${base}/hls/${asset.public_id}/master.m3u8?key=${accessKey}` : null,
        fallbackUrl: `${base}/media/${asset.public_id}?key=${accessKey}`,
      }];
    }),
  };
}
