const authEntryRoutes = new Set(["/login", "/signup", "/forgot-password"]);
const publicRoutes = new Set([...authEntryRoutes, "/auth/callback"]);

function normalizedPathname(pathname: string) {
  return pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
}

export function isAuthEntryRoute(pathname: string) {
  return authEntryRoutes.has(normalizedPathname(pathname));
}

export function isPublicRoute(pathname: string) {
  return publicRoutes.has(normalizedPathname(pathname));
}
