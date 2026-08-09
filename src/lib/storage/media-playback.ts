export const PORTAL_MEDIA_URL_TTL_SECONDS = 5 * 60;

export function portalMediaPlaybackPath(assetPublicId: string) {
  return `/api/v1/media/${encodeURIComponent(assetPublicId)}/playback`;
}
