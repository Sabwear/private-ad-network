import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAuthEntryRoute, isPublicRoute } from "@/lib/auth/routes";
import { getDeviceNetworkContext } from "@/lib/device/network-context";
import { getSupabaseEnv, hasSupabaseEnv } from "@/lib/supabase/config";

const activityCookie = "ll-activity-at";
const activityIntervalSeconds = 45;

function redirectWithSessionCookies(url: URL, sessionResponse: NextResponse) {
  const redirectResponse = NextResponse.redirect(url);
  sessionResponse.cookies.getAll().forEach((cookie) =>
    redirectResponse.cookies.set(cookie),
  );
  return redirectResponse;
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const publicRoute = isPublicRoute(pathname);

  if (!hasSupabaseEnv()) {
    if (publicRoute) return NextResponse.next({ request });

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("message", "service-unavailable");
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  let response = NextResponse.next({ request });
  const { url, publishableKey } = getSupabaseEnv();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([key, value]) =>
          response.headers.set(key, value),
        );
      },
    },
  });

  const { data, error } = await supabase.auth.getClaims();
  const authenticated = !error && Boolean(data?.claims?.sub);

  if (authenticated && !publicRoute) {
    const lastRecordedAt = Number(request.cookies.get(activityCookie)?.value ?? 0);
    const activityIsFresh = Number.isFinite(lastRecordedAt)
      && Date.now() - lastRecordedAt < activityIntervalSeconds * 1000;

    if (!activityIsFresh) {
      const network = getDeviceNetworkContext(request);
      const { data: activityAllowed, error: activityError } = await supabase.rpc("record_user_activity", {
        p_path: `${pathname}${request.nextUrl.search}`,
        p_ip: network.ipAddress,
        p_user_agent: network.userAgent,
        p_country_code: network.countryCode,
        p_edge_colo: network.edgeColo,
      });

      if (!activityError && activityAllowed === false) {
        await supabase.auth.signOut({ scope: "local" });
        const loginUrl = new URL("/login?message=access-revoked", request.url);
        return redirectWithSessionCookies(loginUrl, response);
      }

      if (!activityError && activityAllowed) {
        response.cookies.set(activityCookie, String(Date.now()), {
          httpOnly: true,
          sameSite: "lax",
          secure: request.nextUrl.protocol === "https:",
          path: "/",
          maxAge: activityIntervalSeconds,
        });
      }
    }
  }

  if (!authenticated && !publicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return redirectWithSessionCookies(url, response);
  }

  if (authenticated && isAuthEntryRoute(pathname)) {
    return redirectWithSessionCookies(new URL("/overview", request.url), response);
  }

  return response;
}
