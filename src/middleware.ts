import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Cloudflare Workers currently require the Edge middleware convention.
// Next.js 16 proxy.ts is Node-only and cannot run in workerd yet.
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
