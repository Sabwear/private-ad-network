export type DeviceNetworkContext = {
  ipAddress: string;
  userAgent: string;
  countryCode: string;
  regionCode: string;
  city: string;
  edgeColo: string;
};

function normalizedIp(value: string | null) {
  const candidate = value?.split(",")[0]?.trim() ?? "";
  if (!candidate || candidate.length > 64 || !/^[0-9a-f.:]+$/i.test(candidate)) return "";
  return candidate;
}

export function getDeviceNetworkContext(request: Request): DeviceNetworkContext {
  const forwardedIp = normalizedIp(request.headers.get("x-forwarded-for"));
  const realIp = normalizedIp(request.headers.get("x-real-ip"));
  const providerIp = normalizedIp(request.headers.get("cf-connecting-ip"));
  const countryCode = (
    request.headers.get("x-vercel-ip-country")
    ?? request.headers.get("cf-ipcountry")
    ?? ""
  ).trim().toUpperCase();
  const regionCode = (request.headers.get("x-vercel-ip-country-region") ?? "").trim().toUpperCase();
  const encodedCity = request.headers.get("x-vercel-ip-city") ?? "";
  let city = "";
  try {
    city = decodeURIComponent(encodedCity).trim().slice(0, 120);
  } catch {
    city = "";
  }
  const ray = request.headers.get("cf-ray")?.trim() ?? "";
  const vercelEdge = request.headers.get("x-vercel-id")?.split("::")[0]?.trim().toUpperCase() ?? "";
  const providerEdge = ray.includes("-") ? ray.split("-").at(-1)?.toUpperCase() ?? "" : vercelEdge;

  return {
    ipAddress: forwardedIp || realIp || providerIp,
    userAgent: request.headers.get("user-agent")?.slice(0, 1000) ?? "",
    countryCode: /^[A-Z]{2}$/.test(countryCode) ? countryCode : "",
    regionCode: /^[A-Z0-9-]{1,12}$/.test(regionCode) ? regionCode : "",
    city: /^[\p{L}\p{N} .,'()\-]{1,120}$/u.test(city) ? city : "",
    edgeColo: /^[A-Z0-9]{3,12}$/.test(providerEdge) ? providerEdge : "",
  };
}
