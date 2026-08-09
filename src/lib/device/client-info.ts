export type DeviceClientInfo = {
  appVersion: string;
  deviceType: string;
  osName: string;
  browserName: string;
  locale: string;
  languages: string[];
  timezone: string;
  screenWidth: number;
  screenHeight: number;
  availableWidth: number;
  availableHeight: number;
  devicePixelRatio: number;
  colorDepth: number;
  hardwareConcurrency: number | null;
  deviceMemoryGb: number | null;
  maxTouchPoints: number;
  connectionType: string;
  downlinkMbps: number | null;
  roundTripMs: number | null;
  saveData: boolean | null;
  displayMode: string;
  userAgentBrands: string[];
  platform: string;
  mobile: boolean;
};

type NavigatorWithHints = Navigator & {
  deviceMemory?: number;
  userAgentData?: {
    brands?: Array<{ brand: string; version: string }>;
    mobile?: boolean;
    platform?: string;
  };
  connection?: {
    effectiveType?: string;
    type?: string;
    downlink?: number;
    rtt?: number;
    saveData?: boolean;
  };
};

function detectDeviceType(userAgent: string, mobile: boolean, touchPoints: number) {
  if (/smart-tv|smarttv|googletv|appletv|hbbtv|netcast|viera|tizen|web0s|webos|aft[a-z0-9]/i.test(userAgent)) return "tv";
  if (/tablet|ipad|playbook|silk/i.test(userAgent) || (touchPoints > 1 && Math.min(screen.width, screen.height) >= 600)) return "tablet";
  if (mobile || /mobi|android|iphone|ipod/i.test(userAgent)) return "mobile";
  return "desktop";
}

function detectOs(userAgent: string, platform: string) {
  if (/android/i.test(userAgent)) return "Android";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "iOS / iPadOS";
  if (/windows/i.test(userAgent) || /win/i.test(platform)) return "Windows";
  if (/macintosh|mac os/i.test(userAgent) || /mac/i.test(platform)) return "macOS";
  if (/cros/i.test(userAgent)) return "ChromeOS";
  if (/linux/i.test(userAgent) || /linux/i.test(platform)) return "Linux";
  return platform || "Unknown";
}

function detectBrowser(userAgent: string) {
  if (/edg\//i.test(userAgent)) return "Microsoft Edge";
  if (/opr\//i.test(userAgent)) return "Opera";
  if (/firefox\//i.test(userAgent)) return "Firefox";
  if (/chrome\//i.test(userAgent)) return "Chrome";
  if (/safari\//i.test(userAgent)) return "Safari";
  return "Embedded web runtime";
}

export function collectDeviceClientInfo(): DeviceClientInfo {
  const nav = navigator as NavigatorWithHints;
  const userAgent = nav.userAgent;
  const mobile = nav.userAgentData?.mobile ?? /mobi|android|iphone|ipod/i.test(userAgent);
  const platform = nav.userAgentData?.platform || nav.platform || "Unknown";
  const connection = nav.connection;

  return {
    appVersion: "loopline-web-player/0.1.0",
    deviceType: detectDeviceType(userAgent, mobile, nav.maxTouchPoints),
    osName: detectOs(userAgent, platform),
    browserName: detectBrowser(userAgent),
    locale: nav.language,
    languages: [...nav.languages].slice(0, 10),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Unknown",
    screenWidth: screen.width,
    screenHeight: screen.height,
    availableWidth: screen.availWidth,
    availableHeight: screen.availHeight,
    devicePixelRatio: window.devicePixelRatio,
    colorDepth: screen.colorDepth,
    hardwareConcurrency: nav.hardwareConcurrency || null,
    deviceMemoryGb: nav.deviceMemory ?? null,
    maxTouchPoints: nav.maxTouchPoints,
    connectionType: connection?.effectiveType || connection?.type || (navigator.onLine ? "online" : "offline"),
    downlinkMbps: connection?.downlink ?? null,
    roundTripMs: connection?.rtt ?? null,
    saveData: connection?.saveData ?? null,
    displayMode: window.matchMedia("(display-mode: standalone)").matches ? "standalone" : "browser",
    userAgentBrands: (nav.userAgentData?.brands ?? []).map(({ brand, version }) => `${brand} ${version}`).slice(0, 10),
    platform,
    mobile,
  };
}

export async function createDeviceKeyPair() {
  const generated = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", generated.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", generated.privateKey);
  const publicKeyBytes = new TextEncoder().encode(JSON.stringify(publicKeyJwk, Object.keys(publicKeyJwk).sort()));
  const fingerprintBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", publicKeyBytes));
  const fingerprint = Array.from(fingerprintBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    privateKeyJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  return { publicKeyJwk, privateKey, fingerprint: `sha256:${fingerprint}` };
}

export type StoredDeviceSession = {
  activationId: string;
  credentialToken: string;
  code: string;
  expiresAt: string;
  devicePublicId?: string;
  privateKey: CryptoKey;
};

const databaseName = "loopline-device";
const storeName = "identity";

function openIdentityDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function storeDeviceSession(session: StoredDeviceSession) {
  const database = await openIdentityDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(session, "current");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function loadDeviceSession() {
  const database = await openIdentityDatabase();
  const session = await new Promise<StoredDeviceSession | undefined>((resolve, reject) => {
    const request = database.transaction(storeName).objectStore(storeName).get("current");
    request.onsuccess = () => resolve(request.result as StoredDeviceSession | undefined);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return session;
}
