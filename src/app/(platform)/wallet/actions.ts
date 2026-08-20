"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";

export type CreditGrantState = { status: "idle" | "error" | "success"; message: string };

const grantSchema = z.object({
  organizationId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive().max(1_000_000),
  reason: z.string().trim().min(5).max(300),
});

export async function grantBusinessCredits(_state: CreditGrantState, formData: FormData): Promise<CreditGrantState> {
  const workspace = await getWorkspaceContext();
  if (!workspace.permissions.canAccessAdmin) return { status: "error", message: "Administrator access is required." };
  const parsed = grantSchema.safeParse({
    organizationId: formData.get("organizationId"),
    amount: formData.get("amount"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { status: "error", message: "Choose a business, enter a positive credit amount, and provide an administrative reason." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_grant_business_credits", {
    p_organization_id: parsed.data.organizationId,
    p_amount: parsed.data.amount,
    p_reason: parsed.data.reason,
  });
  if (error) return { status: "error", message: error.message };

  revalidatePath("/wallet");
  revalidatePath("/operations");
  revalidatePath("/monitor");
  return { status: "success", message: `${parsed.data.amount.toFixed(3)} promotional credits granted. Eligible channel media will enter the live loop immediately.` };
}
