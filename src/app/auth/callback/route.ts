import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/redirects";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  if (!hasSupabaseEnv()) {
    return NextResponse.redirect(new URL("/login?message=service-unavailable", request.url));
  }

  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const safeNext = safeNextPath(request.nextUrl.searchParams.get("next"));
  const recoveryFlow = request.nextUrl.searchParams.get("flow") === "recovery" || type === "recovery";
  const invitationFlow = request.nextUrl.searchParams.get("flow") === "invite" || type === "invite";
  const supabase = await createClient();
  let error: Error | null = null;

  if (code) {
    const result = await supabase.auth.exchangeCodeForSession(code);
    error = result.error;
  } else if (tokenHash && type) {
    const result = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    error = result.error;
  } else {
    error = new Error("Missing authentication code");
  }

  if (!error) {
    const response = NextResponse.redirect(new URL(safeNext, request.url));
    if ((recoveryFlow || invitationFlow) && safeNext === "/reset-password") {
      response.cookies.set("ll-password-recovery", "1", {
        httpOnly: true,
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
        path: "/",
        maxAge: 15 * 60,
      });
    }
    return response;
  }

  return NextResponse.redirect(new URL("/login?message=auth-callback-failed", request.url));
}
