import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const isCurrentUserPlatformAdmin = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== "string") return false;
  const { data: profile } = await supabase.from("profiles").select("platform_role,account_status").eq("id", userId).maybeSingle();
  return profile?.platform_role === "admin" && profile.account_status === "active";
});
