import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const statusSchema = z.object({
  activationId: z.string().uuid(),
  credentialToken: z.string().min(32).max(256),
});

export async function POST(request: Request) {
  const parsed = statusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid activation session." }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("device_activation_status", {
    p_activation_id: parsed.data.activationId,
    p_credential_token: parsed.data.credentialToken,
  });

  if (error || !data?.[0]) return NextResponse.json({ error: "Activation session not found." }, { status: 404 });
  return NextResponse.json(data[0], { headers: { "Cache-Control": "no-store" } });
}
