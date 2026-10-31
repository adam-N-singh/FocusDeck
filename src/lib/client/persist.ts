/**
 * Local-first persistence: everything FocusDeck knows lives in this browser's
 * storage and nowhere else. Every access is guarded — storage can be full,
 * disabled, or unavailable in a private window, and FocusDeck must still run.
 */
export const KEYS = {
  model: "focusdeck:v1:model",
  live: "focusdeck:v1:live",
  history: "focusdeck:v1:history",
  onboarded: "focusdeck:v1:onboarded",
  bridge: "focusdeck:v1:bridge",
  /** Only needed when the server sets FOCUSDECK_SENSOR_TOKEN. */
  token: "focusdeck:v1:token",
} as const;

/** Authorization header for FocusDeck's own API calls, when a token has been entered. */
export function authHeaders(): Record<string, string> {
  const token = readJson(KEYS.token);
  return typeof token === "string" && token ? { Authorization: `Bearer ${token}` } : {};
}

export function readJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or privacy mode: keep running in memory.
  }
}

export function removeKeys(): void {
  try {
    for (const key of Object.values(KEYS)) window.localStorage.removeItem(key);
  } catch {
    // Nothing to remove.
  }
}

/** Approximate bytes FocusDeck stores, for the What-it-sees screen. */
export function storedBytes(): number {
  try {
    return Object.values(KEYS).reduce((sum, key) => sum + (window.localStorage.getItem(key)?.length ?? 0), 0);
  } catch {
    return 0;
  }
}
