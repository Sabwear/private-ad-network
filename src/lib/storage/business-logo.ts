export const BUSINESS_LOGO_BUCKET = "brand-assets";
export const BUSINESS_LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const BUSINESS_LOGO_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export function businessLogoExtension(mimeType: string) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}
