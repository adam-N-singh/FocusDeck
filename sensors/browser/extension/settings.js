/**
 * The extension's two settings, kept in chrome.storage.local: where FocusDeck
 * is, and the bearer token if its server sets FOCUSDECK_SENSOR_TOKEN. Pure, so
 * the options page, the service worker and the tests share one definition.
 */

export const DEFAULT_URL = "http://127.0.0.1:3000";

/** chrome.storage.local keys. */
export const STORAGE_KEYS = Object.freeze(["focusdeckUrl", "token"]);

/**
 * The hosts the manifest's host_permissions cover, on any port. The extension
 * can reach nothing else, so the token can't be sent anywhere else either.
 */
export const LOOPBACK_HOSTS = Object.freeze(["127.0.0.1", "localhost"]);

/**
 * Normalizes FocusDeck's address, e.g. "http://localhost:3000/" →
 * "http://localhost:3000".
 *
 * Returns null unless it is FocusDeck on this machine: http on 127.0.0.1 or
 * localhost, any port, an optional path, and no credentials, query or
 * fragment.
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeFocusDeckUrl(value) {
  if (typeof value !== "string") return null;
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" || !LOOPBACK_HOSTS.includes(url.hostname)) return null;
  if (url.username || url.password || url.search || url.hash) return null;
  return url.origin + url.pathname.replace(/\/+$/, "");
}

/**
 * The token, trimmed. "" means no token. Null means it can't be sent in a
 * header, because it isn't printable ASCII.
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeToken(value) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return null;
  const token = value.trim();
  return /^[\x20-\x7e]*$/.test(token) ? token : null;
}

/**
 * Turns what chrome.storage.local holds into the settings in use. Anything
 * invalid falls back to the default URL and no token.
 * @param {Record<string, unknown> | undefined} stored
 * @returns {{ url: string, token: string }}
 */
export function readSettings(stored) {
  return {
    url: normalizeFocusDeckUrl(stored?.focusdeckUrl) ?? DEFAULT_URL,
    token: normalizeToken(stored?.token) ?? "",
  };
}
