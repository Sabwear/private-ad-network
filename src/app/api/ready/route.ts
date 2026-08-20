import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseAdminEnv } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const admin = createAdminClient();
    const checks = await Promise.all([
      admin.from("streaming_channels").select("id,show_progress_bar,show_fullscreen_control,overlay_position,overlay_style,accent_color", { head: true }),
      admin.from("organizations").select("id,operating_time_zone", { head: true }),
      admin.from("organization_operating_schedules").select("id", { head: true }),
      admin.from("organization_busy_periods").select("id,multiplier", { head: true }),
    ]);
    if (checks.some(({ error }) => error)) throw new Error("Required database schema is unavailable.");
    return NextResponse.json({ status: "ready" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
