"use server";

import { revalidatePath } from "next/cache";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type DemoCleanupState = { status: "idle" | "error" | "success"; message: string };

export async function clearDemoData(_state: DemoCleanupState, formData: FormData): Promise<DemoCleanupState> {
  const workspace = await getWorkspaceContext();
  if (!workspace.permissions.canProvisionOrganizations || workspace.membership.role !== "admin") {
    return { status: "error", message: "Platform administrator access is required." };
  }
  if (formData.get("acknowledged") !== "yes" || formData.get("confirmation") !== "DELETE DEMO DATA") {
    return { status: "error", message: "Complete both confirmation steps exactly as shown." };
  }

  const admin = createAdminClient();
  const { data: organizations, error: organizationError } = await admin.from("organizations").select("id").contains("billing_profile", { demo: true });
  if (organizationError) return { status: "error", message: "Demo records could not be inspected safely." };
  const organizationIds = (organizations ?? []).map((organization) => organization.id);
  if (!organizationIds.length) return { status: "success", message: "There is no demo content to remove." };

  const { data: assets, error: assetError } = await admin.from("media_assets").select("original_storage_path,normalized_storage_path,thumbnail_storage_path,hls_master_storage_path").in("organization_id", organizationIds);
  if (assetError) return { status: "error", message: "Demo media could not be inspected safely." };
  const storagePaths = [...new Set((assets ?? []).flatMap((asset) => [asset.original_storage_path, asset.normalized_storage_path, asset.thumbnail_storage_path, asset.hls_master_storage_path]).filter((path): path is string => Boolean(path)))];
  if (storagePaths.length) {
    const { error: storageError } = await admin.storage.from("media").remove(storagePaths);
    if (storageError) return { status: "error", message: "Demo files could not be removed, so no database records were changed." };
  }

  const supabase = await createClient();
  const { data: removed, error } = await supabase.rpc("admin_clear_demo_data", { p_confirmation: "DELETE DEMO DATA" });
  if (error) return { status: "error", message: "Demo database records could not be removed." };

  for (const path of ["/admin", "/overview", "/business", "/locations", "/screens", "/media", "/campaigns", "/channels"]) revalidatePath(path);
  return { status: "success", message: `${removed} demo businesses and all related demo content were removed. Real client data was not touched.` };
}
