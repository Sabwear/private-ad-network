"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSiteOrigin } from "@/lib/auth/redirects";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseAdminEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type UserActionState = {
  status: "idle" | "error" | "success";
  message: string;
  fieldErrors?: Partial<Record<"name" | "email" | "accountType" | "accountStatus" | "reason", string>>;
};

const inviteSchema = z.object({
  name: z.string().trim().min(2, "Enter the user's full name.").max(100),
  email: z.string().trim().max(254).email("Enter a valid email address."),
  accountType: z.enum(["viewer", "admin"]),
  reason: z.string().trim().min(5, "Record why access is being created.").max(300),
});

const accessSchema = z.object({
  userId: z.string().uuid(),
  accountStatus: z.enum(["pending", "active", "suspended"]),
  reason: z.string().trim().min(5, "Record why access is changing.").max(300),
});

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function errorsFrom(error: z.ZodError): UserActionState["fieldErrors"] {
  const errors: NonNullable<UserActionState["fieldErrors"]> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && field !== "userId" && !errors[field as keyof typeof errors]) {
      errors[field as keyof typeof errors] = issue.message;
    }
  }
  return errors;
}

async function requirePlatformAdministrator() {
  const workspace = await getWorkspaceContext();
  return workspace.permissions.canProvisionOrganizations;
}

export async function invitePlatformAccount(_state: UserActionState, formData: FormData): Promise<UserActionState> {
  if (!await requirePlatformAdministrator()) return { status: "error", message: "Platform administrator access is required." };
  const parsed = inviteSchema.safeParse({
    name: stringField(formData, "name"),
    email: stringField(formData, "email"),
    accountType: stringField(formData, "accountType"),
    reason: stringField(formData, "reason"),
  });
  if (!parsed.success) return { status: "error", message: "Check the highlighted fields and try again.", fieldErrors: errorsFrom(parsed.error) };
  if (!hasSupabaseAdminEnv()) return { status: "error", message: "Account invitations require the server administrator key in hosting settings." };

  const origin = await getSiteOrigin();
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password&flow=invite`,
    data: { full_name: parsed.data.name, access_source: "administrator_invite", account_type: parsed.data.accountType },
  });
  if (error || !data.user) {
    const duplicate = error?.message.toLowerCase().includes("already") || error?.status === 422;
    return { status: "error", message: duplicate ? "An account already exists for that email." : "The invitation could not be sent. Check email delivery settings and try again." };
  }

  const supabase = await createClient();
  const { error: finalizeError } = await supabase.rpc("admin_finalize_platform_invite", {
    p_user_id: data.user.id,
    p_full_name: parsed.data.name,
    p_platform_role: parsed.data.accountType,
    p_reason: parsed.data.reason,
  });
  if (finalizeError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { status: "error", message: "The account was not finalized. Deploy the latest database migration and try again." };
  }

  revalidatePath("/users");
  return { status: "success", message: `Invitation sent to ${parsed.data.email}. ${parsed.data.accountType === "admin" ? "This account will manage the full platform after email setup." : "This account can identify itself while watching streams but cannot open the dashboard."}` };
}

export async function updateUserAccess(_state: UserActionState, formData: FormData): Promise<UserActionState> {
  if (!await requirePlatformAdministrator()) return { status: "error", message: "Platform administrator access is required." };
  const parsed = accessSchema.safeParse({
    userId: stringField(formData, "userId"),
    accountStatus: stringField(formData, "accountStatus"),
    reason: stringField(formData, "reason"),
  });
  if (!parsed.success) return { status: "error", message: "Check the highlighted fields and try again.", fieldErrors: errorsFrom(parsed.error) };
  if (!hasSupabaseAdminEnv()) return { status: "error", message: "Access changes require the server administrator key in hosting settings." };

  const admin = createAdminClient();
  const nextBanDuration = parsed.data.accountStatus === "suspended" ? "876000h" : "none";
  const previousBanDuration = parsed.data.accountStatus === "suspended" ? "none" : "876000h";
  const { error: authError } = await admin.auth.admin.updateUserById(parsed.data.userId, { ban_duration: nextBanDuration });
  if (authError) return { status: "error", message: "Authentication access could not be updated. Try again." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_platform_user_access", {
    p_user_id: parsed.data.userId,
    p_account_status: parsed.data.accountStatus,
    p_reason: parsed.data.reason,
  });
  if (error) {
    await admin.auth.admin.updateUserById(parsed.data.userId, { ban_duration: previousBanDuration });
    return { status: "error", message: "The access change could not be completed. Refresh and try again." };
  }

  revalidatePath("/users");
  return { status: "success", message: parsed.data.accountStatus === "suspended" ? "Viewer access suspended and observed sessions revoked." : "Viewer access updated." };
}
