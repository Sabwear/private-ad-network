import { NextResponse } from "next/server";
import { z } from "zod";
import { getDeviceNetworkContext } from "@/lib/device/network-context";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  publicKeyJwk: z.record(z.string(), z.unknown()),
  keyFingerprint: z.string().min(16).max(160),
  deviceInfo: z.record(z.string(), z.unknown()),
});

const pairingAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomString(length: number, alphabet: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function randomToken() {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "");
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid device registration details." }, { status: 400 });
  }

  const network = getDeviceNetworkContext(request);
  const supabase = await createClient();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = randomString(6, pairingAlphabet);
    const credentialToken = randomToken();
    const { data, error } = await supabase.rpc("request_device_activation", {
      p_code: code,
      p_credential_token: credentialToken,
      p_public_key_jwk: parsed.data.publicKeyJwk as Json,
      p_key_fingerprint: parsed.data.keyFingerprint,
      p_device_info: parsed.data.deviceInfo as Json,
      p_ip: network.ipAddress,
      p_user_agent: network.userAgent,
      p_country_code: network.countryCode,
      p_edge_colo: network.edgeColo,
    });

    const activation = data?.[0];
    if (!error && activation) {
      return NextResponse.json(
        {
          activationId: activation.activation_id,
          code,
          credentialToken,
          expiresAt: activation.expires_at,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (error?.code === "54000") {
      return NextResponse.json({ error: "Too many pairing requests. Try again in one hour." }, { status: 429 });
    }
    if (error?.code !== "23505" || attempt === 2) {
      return NextResponse.json({ error: "Unable to start secure pairing." }, { status: 503 });
    }
  }

  return NextResponse.json({ error: "Unable to allocate a pairing code." }, { status: 503 });
}
