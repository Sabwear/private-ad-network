import { headers } from "next/headers";

const fallbackBase = "https://loopline.invalid";

export function safeNextPath(value: string | null | undefined, fallback = "/overview") {
  if (!value || /[\u0000-\u001F\\]/.test(value)) return fallback;

  try {
    const parsed = new URL(value, fallbackBase);
    if (parsed.origin !== fallbackBase || !parsed.pathname.startsWith("/")) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export async function getSiteOrigin() {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configuredUrl) {
    const parsed = new URL(configuredUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error("NEXT_PUBLIC_SITE_URL must use http or https.");
    }
    return parsed.origin;
  }

  const requestHeaders = await headers();
  const requestOrigin = requestHeaders.get("origin");
  if (process.env.NODE_ENV !== "production" && requestOrigin) {
    const parsed = new URL(requestOrigin);
    if (["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) return parsed.origin;
  }

  throw new Error("NEXT_PUBLIC_SITE_URL is required for hosted authentication redirects.");
}
