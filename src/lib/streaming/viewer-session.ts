import "server-only";

import { createHash, createHmac, randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

export const STREAM_VIEWER_COOKIE = "loopline_stream_viewer";
export const STREAM_VIEWER_SESSION_SECONDS = 12 * 60 * 60;

export function createViewerToken() {
  return randomBytes(32).toString("hex");
}

export function hashViewerToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function hashNetworkIdentifier(value: string) {
  const pepper = process.env.STREAM_VIEWER_HASH_SECRET ?? process.env.SUPABASE_SECRET_KEY;
  if (!pepper) throw new Error("A server-side viewer hash secret is required");
  return createHmac("sha256", pepper).update(value || "unknown").digest("hex");
}

export function viewerTokenFromRequest(request: Request) {
  const value = request.headers.get("cookie")
    ?.split(";")
    .map((part) => part.trim().split("="))
    .find(([name]) => name === STREAM_VIEWER_COOKIE)?.[1];
  return value ? decodeURIComponent(value) : null;
}

export type ApprovedStreamViewer = { id: string; name: string; email: string };

export async function getApprovedStreamViewer(): Promise<ApprovedStreamViewer | null> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id,email,full_name,email_verified_at,account_status")
    .eq("id", userId)
    .eq("account_status", "active")
    .not("email_verified_at", "is", null)
    .maybeSingle();
  if (!profile) return null;
  return {
    id: profile.id,
    email: profile.email,
    name: profile.full_name?.trim() || profile.email.split("@")[0] || "Approved viewer",
  };
}
