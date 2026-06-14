/**
 * Lightweight, zero-dependency device fingerprinting + UA parsing.
 * The fingerprint is a one-way SHA-256 hash of stable browser signals, used for
 * anomaly detection (flagging a session on a new device), not cross-site tracking.
 */

export interface DeviceInfo {
  browser: string;
  os: string;
  device: string;
}

export async function generateFingerprint(): Promise<string> {
  const signals: string[] = [
    String(screen.width),
    String(screen.height),
    String(screen.colorDepth),
    navigator.language,
    (navigator.languages ?? []).join(","),
    navigator.platform,
    String(navigator.hardwareConcurrency ?? 0),
    String(new Date().getTimezoneOffset()),
    String(navigator.maxTouchPoints ?? 0),
  ];

  const encoded = new TextEncoder().encode(signals.join("|"));
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function getDeviceInfo(userAgent?: string): DeviceInfo {
  const ua = userAgent || navigator.userAgent;
  return { browser: parseBrowser(ua), os: parseOS(ua), device: parseDeviceType(ua) };
}

function parseBrowser(ua: string): string {
  const edge = ua.match(/Edg(?:e|A|iOS)?\/(\d+)/);
  if (edge) return `Edge ${edge[1]}`;
  const opera = ua.match(/(?:OPR|Opera)\/(\d+)/);
  if (opera) return `Opera ${opera[1]}`;
  const samsung = ua.match(/SamsungBrowser\/(\d+)/);
  if (samsung) return `Samsung Internet ${samsung[1]}`;
  const firefox = ua.match(/Firefox\/(\d+)/);
  if (firefox) return `Firefox ${firefox[1]}`;
  const chrome = ua.match(/Chrome\/(\d+)/);
  if (chrome) return `Chrome ${chrome[1]}`;
  const safari = ua.match(/Version\/(\d+).*Safari/);
  if (safari) return `Safari ${safari[1]}`;
  return "Unknown";
}

function parseOS(ua: string): string {
  if (/Windows NT/.test(ua)) return "Windows";
  if (/Mac OS X/.test(ua)) return "macOS";
  if (/CrOS/.test(ua)) return "Chrome OS";
  if (/Android/.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  if (/Linux/.test(ua)) return "Linux";
  return "Unknown";
}

function parseDeviceType(ua: string): string {
  if (/iPad/.test(ua)) return "tablet";
  if (/Android/.test(ua) && !/Mobile/.test(ua)) return "tablet";
  if (/Silk/.test(ua)) return "tablet";
  if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone|BlackBerry|Opera Mini|IEMobile/.test(ua)) {
    return "mobile";
  }
  return "desktop";
}
