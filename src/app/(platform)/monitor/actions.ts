"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";

export type MonitorActionState = { status: "idle" | "error" | "success"; message: string };

async function isPlatformAdmin() {
  const workspace = await getWorkspaceContext();
  return workspace.account.role === "admin" && workspace.permissions.canProvisionOrganizations;
}

function formValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function handleMonitorChannel(_state: MonitorActionState, formData: FormData): Promise<MonitorActionState> {
  if (!await isPlatformAdmin()) return { status: "error", message: "Platform administrator access is required." };
  const parsed = z.object({ channelId: z.coerce.number().int().positive(), action: z.enum(["pause", "resume", "restart"]), reason: z.string().trim().min(5).max(300) }).safeParse({
    channelId: formValue(formData, "channelId"), action: formValue(formData, "action"), reason: formValue(formData, "reason"),
  });
  if (!parsed.success) return { status: "error", message: "Choose an action and enter an operational reason." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_handle_stream_channel", { p_channel_id: parsed.data.channelId, p_action: parsed.data.action, p_reason: parsed.data.reason });
  if (error) return { status: "error", message: "The channel operation could not be completed." };
  revalidatePath("/operations"); revalidatePath("/stream/[channelId]/[accessKey]", "page");
  return { status: "success", message: `Channel ${parsed.data.action} completed and audited.` };
}

export async function endMonitorViewerSession(_state: MonitorActionState, formData: FormData): Promise<MonitorActionState> {
  if (!await isPlatformAdmin()) return { status: "error", message: "Platform administrator access is required." };
  const parsed = z.object({ sessionId: z.string().uuid(), reason: z.string().trim().min(5).max(300) }).safeParse({ sessionId: formValue(formData, "sessionId"), reason: formValue(formData, "reason") });
  if (!parsed.success) return { status: "error", message: "Enter a reason before ending this viewer session." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_end_stream_viewer_session", { p_session_id: parsed.data.sessionId, p_reason: parsed.data.reason });
  if (error) return { status: "error", message: "The viewer session could not be ended." };
  revalidatePath("/operations");
  return { status: "success", message: "Viewer session ended and recorded in the audit log." };
}
