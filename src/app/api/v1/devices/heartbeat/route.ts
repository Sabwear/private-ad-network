import { NextResponse } from "next/server";
import { z } from "zod";
import { getDeviceNetworkContext } from "@/lib/device/network-context";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

const heartbeatSchema = z.object({
  devicePublicId: z.string().uuid(),
  clientInfo: z.record(z.string(), z.unknown()),
});

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const credentialToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (credentialToken.length < 32 || credentialToken.length > 256) {
    return NextResponse.json({ error: "Device authentication is required." }, { status: 401 });
  }

  const parsed = heartbeatSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid heartbeat payload." }, { status: 400 });

  const network = getDeviceNetworkContext(request);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_device_heartbeat", {
    p_device_public_id: parsed.data.devicePublicId,
    p_credential_token: credentialToken,
    p_client_info: parsed.data.clientInfo as Json,
    p_ip: network.ipAddress,
    p_user_agent: network.userAgent,
    p_country_code: network.countryCode,
    p_edge_colo: network.edgeColo,
  });

  if (error) return NextResponse.json({ error: "Device credential is invalid or inactive." }, { status: 401 });
  return NextResponse.json({ acceptedAt: data, nextHeartbeatSeconds: 45 }, { headers: { "Cache-Control": "no-store" } });
}
