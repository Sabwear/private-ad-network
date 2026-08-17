"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";

export type ScreenActionState = {
  status: "idle" | "error" | "success";
  message: string;
  fieldErrors?: Partial<Record<"code" | "locationId" | "name" | "reason", string>>;
};

const claimSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z2-9]{6}$/, "Enter the six-character code shown on the screen."),
  locationId: z.coerce.number().int().positive("Select a location."),
  name: z.string().trim().min(2, "Enter a screen name.").max(120),
  reason: z.string().trim().min(5, "Record why this screen is being paired.").max(300),
});

const suspensionSchema = z.object({
  devicePublicId: z.string().uuid(),
  reason: z.string().trim().min(5, "Record why this screen is being suspended.").max(300),
});

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function claimScreen(
  _previousState: ScreenActionState,
  formData: FormData,
): Promise<ScreenActionState> {
  const workspace = await getWorkspaceContext();
  if (!workspace.permissions.canManageDevices) {
    return { status: "error", message: "You do not have permission to pair screens." };
  }

  const parsed = claimSchema.safeParse({
    code: stringField(formData, "code"),
    locationId: stringField(formData, "locationId"),
    name: stringField(formData, "name"),
    reason: stringField(formData, "reason"),
  });

  if (!parsed.success) {
    const fieldErrors: NonNullable<ScreenActionState["fieldErrors"]> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && !fieldErrors[field as keyof typeof fieldErrors]) {
        fieldErrors[field as keyof typeof fieldErrors] = issue.message;
      }
    }
    return { status: "error", message: "Check the pairing details and try again.", fieldErrors };
  }

  if (workspace.organization.id !== null) {
    const supabase = await createClient();
    const { data: location } = await supabase
      .from("locations")
      .select("organization_id")
      .eq("id", parsed.data.locationId)
      .maybeSingle();
    if (!location || location.organization_id !== workspace.organization.id) {
      return { status: "error", message: "You can only pair screens to your own active locations." };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("claim_device_activation", {
    p_code: parsed.data.code,
    p_location_id: parsed.data.locationId,
    p_name: parsed.data.name,
    p_reason: parsed.data.reason,
  });

  if (error) {
    return {
      status: "error",
      message: error.code === "PGRST202"
        ? "Screen pairing is unavailable until the latest database migration is deployed."
        : error.code === "P0002"
          ? "That pairing code is invalid or expired. Generate a new code on the screen."
          : "The screen could not be paired. Verify the code and location, then try again.",
    };
  }

  revalidatePath("/business");
  revalidatePath("/overview");
  return { status: "success", message: "Screen paired. Waiting for its first secure heartbeat." };
}

export async function suspendScreen(
  _previousState: ScreenActionState,
  formData: FormData,
): Promise<ScreenActionState> {
  const workspace = await getWorkspaceContext();
  if (!workspace.permissions.canManageDevices) {
    return { status: "error", message: "You do not have permission to suspend screens." };
  }

  const parsed = suspensionSchema.safeParse({
    devicePublicId: stringField(formData, "devicePublicId"),
    reason: stringField(formData, "reason"),
  });
  if (!parsed.success) return { status: "error", message: "Enter a clear suspension reason." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("suspend_device", {
    p_device_public_id: parsed.data.devicePublicId,
    p_reason: parsed.data.reason,
  });
  if (error) return { status: "error", message: "The screen could not be suspended." };

  revalidatePath("/business");
  revalidatePath("/overview");
  return { status: "success", message: "Screen suspended and its credential revoked." };
}
