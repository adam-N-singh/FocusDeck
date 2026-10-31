/**
 * Who may talk to the sensor bridge. FocusDeck is a local companion, so the
 * bridge answers on loopback only, refuses cross-site browser requests
 * (CSRF, DNS rebinding), and requires JSON for writes so a malicious page
 * cannot send a "simple" request past CORS preflight. Exposing it beyond
 * this machine needs FOCUSDECK_ALLOWED_HOSTS plus FOCUSDECK_SENSOR_TOKEN,
 * and then the token is required from every client.
 * Pure and framework-free, so it is tested directly.
 */
export interface RequestFacts {
  host: string | null;
  origin: string | null;
  secFetchSite: string | null;
  contentType: string | null;
  authorization: string | null;
}

export interface TrustConfig {
  token?: string;
  allowedHosts?: string[];
}

export type TrustNeed = "read" | "write" | "write-config";

export type TrustVerdict =
  | { ok: true; via: "browser" | "sensor" }
  | { ok: false; status: 401 | 403 | 415; reason: string };

const LOOPBACK = ["localhost", "127.0.0.1", "[::1]"];

/** "localhost:3000" → "localhost", "[::1]:3000" → "[::1]". */
export function hostName(host: string): string {
  const trimmed = host.trim().toLowerCase();
  if (trimmed.startsWith("[")) return trimmed.slice(0, trimmed.indexOf("]") + 1);
  return trimmed.split(":")[0];
}

/** Constant-time string comparison, so a token can't be guessed byte by byte. */
export function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export function checkTrust(facts: RequestFacts, config: TrustConfig, need: TrustNeed): TrustVerdict {
  const allowed = [...LOOPBACK, ...(config.allowedHosts ?? []).map(hostName)];
  if (!facts.host || !allowed.includes(hostName(facts.host))) {
    return { ok: false, status: 403, reason: "The FocusDeck bridge only answers on this machine. Set FOCUSDECK_ALLOWED_HOSTS (with a token) to expose it." };
  }
  if (facts.secFetchSite === "cross-site" || facts.secFetchSite === "same-site") {
    return { ok: false, status: 403, reason: "Cross-site requests are refused." };
  }
  if (facts.origin && facts.origin !== "null") {
    const sameOrigin = [`http://${facts.host}`, `https://${facts.host}`].includes(facts.origin.toLowerCase());
    if (!sameOrigin) return { ok: false, status: 403, reason: "Requests from other origins are refused." };
  }
  if (need !== "read" && !(facts.contentType ?? "").toLowerCase().includes("application/json")) {
    return { ok: false, status: 415, reason: "Send JSON (Content-Type: application/json)." };
  }
  const via = facts.secFetchSite === "same-origin" ? "browser" : "sensor";
  if (config.token) {
    // Any client can claim to be a same-origin browser, so once a token is set it is the
    // only boundary: every client presents it, the FocusDeck page included.
    const presented = (facts.authorization ?? "").replace(/^Bearer\s+/i, "");
    if (!safeEqual(presented, config.token)) {
      return { ok: false, status: 401, reason: "Missing or wrong token. With FOCUSDECK_SENSOR_TOKEN set, every client must present it — enter it in FocusDeck under Sources." };
    }
  } else if (need === "write-config" && via !== "browser") {
    // Loopback-only default: a best-effort guard so a stray local script doesn't rewrite the filter.
    return { ok: false, status: 403, reason: "Only the FocusDeck app itself may change which apps are designated." };
  }
  return { ok: true, via };
}

/** Extract the facts from a Web Request (route handlers). */
export function requestFacts(request: Request): RequestFacts {
  const h = request.headers;
  return {
    host: h.get("host"),
    origin: h.get("origin"),
    secFetchSite: h.get("sec-fetch-site"),
    contentType: h.get("content-type"),
    authorization: h.get("authorization"),
  };
}

export function trustConfigFromEnv(env: Record<string, string | undefined> = process.env): TrustConfig {
  return {
    token: env.FOCUSDECK_SENSOR_TOKEN || undefined,
    allowedHosts: (env.FOCUSDECK_ALLOWED_HOSTS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  };
}
