import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { getSupabaseEnv, hasSupabaseEnv } from "@/lib/supabase/config";
import type { Database } from "@/lib/supabase/database.types";

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/" && hasSupabaseEnv()) {
    const hostname = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(":")[0].toLowerCase();
    if (hostname && hostname !== "localhost" && hostname !== "127.0.0.1") {
      const { url, publishableKey } = getSupabaseEnv();
      const resolver = createClient<Database>(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data } = await resolver.rpc("resolve_stream_hostname", { p_hostname: hostname });
      const channel = data?.[0];
      if (channel) {
        const destination = request.nextUrl.clone();
        destination.pathname = `/stream/${channel.channel_public_id}/${channel.channel_access_key}`;
        return NextResponse.rewrite(destination);
      }
    }
  }
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
