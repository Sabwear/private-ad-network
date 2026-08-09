import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAuthEntryRoute, isPublicRoute } from "@/lib/auth/routes";
import { getSupabaseEnv, hasSupabaseEnv } from "@/lib/supabase/config";

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
