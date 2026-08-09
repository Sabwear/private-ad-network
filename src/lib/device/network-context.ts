export type DeviceNetworkContext = {
  ipAddress: string;
  userAgent: string;
  countryCode: string;
  edgeColo: string;
};

function normalizedIp(value: string | null) {
  const candidate = value?.split(",")[0]?.trim() ?? "";
  if (!candidate || candidate.length > 64 || !/^[0-9a-f.:]+$/i.test(candidate)) return "";
  return candidate;
}

export function getDeviceNetworkContext(request: Request): DeviceNetworkContext {
  const cloudflareIp = normalizedIp(request.headers.get("cf-connecting-ip"));
  const forwardedIp = normalizedIp(request.headers.get("x-forwarded-for"));
  const realIp = normalizedIp(request.headers.get("x-real-ip"));
  const countryCode = request.headers.get("cf-ipcountry")?.trim().toUpperCase() ?? "";
  const ray = request.headers.get("cf-ray")?.trim() ?? "";
  const edgeColo = ray.includes("-") ? ray.split("-").at(-1)?.toUpperCase() ?? "" : "";

  return {
    ipAddress: cloudflareIp || forwardedIp || realIp,
    userAgent: request.headers.get("user-agent")?.slice(0, 1000) ?? "",
    countryCode: /^[A-Z]{2}$/.test(countryCode) ? countryCode : "",
    edgeColo: /^[A-Z0-9]{3,8}$/.test(edgeColo) ? edgeColo : "",
  };
}
