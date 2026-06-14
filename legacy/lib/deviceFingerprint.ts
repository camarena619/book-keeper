/**
 * @module deviceFingerprint
 * @description Lightweight, zero-dependency device fingerprinting using the
 * Web Crypto API.
 *
 * Collects stable browser/device signals, concatenates them, and hashes with
 * SHA-256 to produce a repeatable (per device + browser) hex fingerprint.
 *
 * **Privacy note:** The fingerprint is a one-way hash — the raw signals cannot
 * be recovered from it.  It is intended for anomaly detection (e.g. flagging a
 * session that suddenly appears on a different device), not for cross-site
 * tracking.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parsed device information extracted from the User-Agent string. */
export interface DeviceInfo {
  /** Browser name and major version, e.g. "Chrome 125". */
  browser: string;
  /** Operating system, e.g. "macOS", "Windows", "Linux", "Android", "iOS". */
  os: string;
  /** Device category: "mobile", "tablet", or "desktop". */
  device: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a SHA-256 hex fingerprint from stable browser and device signals.
 *
 * Signals collected:
 * - `screen.width`, `screen.height`, `screen.colorDepth`
 * - `navigator.language`, `navigator.languages`
 * - `navigator.platform`
 * - `navigator.hardwareConcurrency`
 * - `new Date().getTimezoneOffset()`
 * - `navigator.maxTouchPoints`
 *
 * @returns A 64-character lowercase hex string (SHA-256 digest).
 *
 * @example
 * ```ts
 * const fp = await generateFingerprint();
 * // => "a3f2b8c1..."
 * ```
 */
export async function generateFingerprint(): Promise<string> {
  const signals: string[] = [
    String(screen.width),
    String(screen.height),
    String(screen.colorDepth),
    navigator.language,
    (navigator.languages ?? []).join(','),
    navigator.platform,
    String(navigator.hardwareConcurrency ?? 0),
    String(new Date().getTimezoneOffset()),
    String(navigator.maxTouchPoints ?? 0),
  ];

  const raw = signals.join('|');
  const encoded = new TextEncoder().encode(raw);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);

  // Convert ArrayBuffer → hex string.
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Parse `navigator.userAgent` to extract high-level browser, OS, and device
 * information.
 *
 * This is intentionally a lightweight regex-based parser — it covers the
 * dominant user agents but is **not** a comprehensive UA library.
 *
 * @returns An object with `browser`, `os`, and `device` fields.
 *
 * @example
 * ```ts
 * const info = getDeviceInfo();
 * // => { browser: "Chrome 125", os: "macOS", device: "desktop" }
 * ```
 */
export function getDeviceInfo(userAgent?: string): DeviceInfo {
  const ua = userAgent || navigator.userAgent;

  return {
    browser: parseBrowser(ua),
    os: parseOS(ua),
    device: parseDeviceType(ua),
  };
}

// ---------------------------------------------------------------------------
// Internal parsers
// ---------------------------------------------------------------------------

/**
 * Extract browser name and major version from a UA string.
 * Evaluation order matters — more specific patterns are checked first.
 */
function parseBrowser(ua: string): string {
  // Edge (Chromium-based) — must precede Chrome check.
  const edge = ua.match(/Edg(?:e|A|iOS)?\/(\d+)/);
  if (edge) return `Edge ${edge[1]}`;

  // Opera / OPR — must precede Chrome check.
  const opera = ua.match(/(?:OPR|Opera)\/(\d+)/);
  if (opera) return `Opera ${opera[1]}`;

  // Samsung Internet.
  const samsung = ua.match(/SamsungBrowser\/(\d+)/);
  if (samsung) return `Samsung Internet ${samsung[1]}`;

  // Firefox.
  const firefox = ua.match(/Firefox\/(\d+)/);
  if (firefox) return `Firefox ${firefox[1]}`;

  // Chrome — generic Chromium-based last among Chromium forks.
  const chrome = ua.match(/Chrome\/(\d+)/);
  if (chrome) return `Chrome ${chrome[1]}`;

  // Safari — only when Chrome/Chromium tokens are absent.
  const safari = ua.match(/Version\/(\d+).*Safari/);
  if (safari) return `Safari ${safari[1]}`;

  return 'Unknown';
}

/**
 * Extract operating system name from a UA string.
 */
function parseOS(ua: string): string {
  if (/Windows NT/.test(ua)) return 'Windows';
  if (/Mac OS X/.test(ua)) return 'macOS';
  if (/CrOS/.test(ua)) return 'Chrome OS';
  if (/Android/.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Unknown';
}

/**
 * Determine device category from a UA string.
 *
 * Heuristic order:
 * 1. Tablets: iPad, Android without "Mobile", Silk
 * 2. Mobile: iPhone, Android Mobile, Windows Phone, etc.
 * 3. Fallback: desktop
 */
function parseDeviceType(ua: string): string {
  // Tablets.
  if (/iPad/.test(ua)) return 'tablet';
  if (/Android/.test(ua) && !/Mobile/.test(ua)) return 'tablet';
  if (/Silk/.test(ua)) return 'tablet';

  // Mobile.
  if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone|BlackBerry|Opera Mini|IEMobile/.test(ua)) {
    return 'mobile';
  }

  return 'desktop';
}
