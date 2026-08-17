const authEntryRoutes = new Set(["/login", "/signup", "/forgot-password"]);
const publicRoutes = new Set([...authEntryRoutes, "/auth/callback", "/api/health", "/api/ready"]);
const publicRoutePrefixes = ["/api/v1/devices/activation/", "/api/v1/devices/heartbeat", "/api/v1/channels/", "/api/v1/streams/", "/device/setup", "/stream/", "/watch/"];

function normalizedPathname(pathname: string) {
  return pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
}

export function isAuthEntryRoute(pathname: string) {
  return authEntryRoutes.has(normalizedPathname(pathname));
}

export function isPublicRoute(pathname: string) {
  const normalized = normalizedPathname(pathname);
  return publicRoutes.has(normalized) || publicRoutePrefixes.some((prefix) => (
    prefix.endsWith("/") ? normalized.startsWith(prefix) : normalized === prefix || normalized.startsWith(`${prefix}/`)
  ));
}
