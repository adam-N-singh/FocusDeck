/**
 * The options page: FocusDeck's URL and the optional token, kept in
 * chrome.storage.local. After loading or saving, it asks the service worker to
 * refresh the config and shows what the worker now sees.
 */
import { CATEGORIES } from "./matcher.js";
import { DEFAULT_URL, STORAGE_KEYS, normalizeFocusDeckUrl, normalizeToken, readSettings } from "./settings.js";

/** FocusDeck's own labels for the two categories. */
const LABELS = { "browser-x": "Browser — X", "browser-docs": "Browser — docs" };

const form = /** @type {HTMLFormElement} */ (document.getElementById("settings"));
const urlField = /** @type {HTMLInputElement} */ (document.getElementById("url"));
const tokenField = /** @type {HTMLInputElement} */ (document.getElementById("token"));
const statusLine = /** @type {HTMLElement} */ (document.getElementById("status"));

/** @typedef {"" | "ok" | "warn" | "bad"} Tone */
/** @typedef {{ state?: string, code?: number, watching?: { app: "browser-x" | "browser-docs", sites: number }[] }} Status */

/**
 * @param {string} text
 * @param {Tone} [tone]
 */
function show(text, tone = "") {
  statusLine.textContent = text;
  statusLine.dataset.tone = tone;
}

/** @param {number} count */
const sitesText = (count) => (count === 0 ? "no sites listed" : count === 1 ? "1 site" : `${count} sites`);

/**
 * @param {Status | null} status The worker's answer (Status in background.js), or null if it didn't answer.
 * @param {string} url
 * @returns {[string, Tone]}
 */
function describe(status, url) {
  switch (status?.state) {
    case "connected": {
      const watching = (status.watching ?? []).filter((w) => CATEGORIES.includes(w.app));
      if (watching.length === 0) {
        return ["Connected. Neither Browser — X nor Browser — docs is designated in FocusDeck, so nothing is sent.", "warn"];
      }
      const parts = watching.map((w) => `${LABELS[w.app]} (${sitesText(w.sites)})`);
      return [`Connected. Watching ${parts.join(" and ")}.`, "ok"];
    }
    case "unconfigured":
      return ["Connected, but FocusDeck hasn't shared its designated apps yet. Open FocusDeck with its sensor bridge on.", "warn"];
    case "unauthorized":
      return ["FocusDeck wants its token (FOCUSDECK_SENSOR_TOKEN), or this one is wrong.", "bad"];
    case "error":
      return [`Unexpected answer from FocusDeck (HTTP ${status?.code ?? "?"}).`, "bad"];
    case "unreachable":
      return [`Can't reach FocusDeck at ${url}. Is it running?`, "bad"];
    default:
      return ["The extension's service worker didn't answer. Try reloading the extension.", "bad"];
  }
}

/** @param {string} url */
async function check(url) {
  show("Checking…");
  let status = null;
  try {
    status = await chrome.runtime.sendMessage({ type: "refresh" });
  } catch {
    // The service worker didn't answer. describe() says so.
  }
  show(...describe(status, url));
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const url = normalizeFocusDeckUrl(urlField.value.trim() || DEFAULT_URL);
  if (url === null) {
    show("Enter FocusDeck's address on this computer, like http://127.0.0.1:3000 (http, on 127.0.0.1 or localhost).", "bad");
    return;
  }
  const token = normalizeToken(tokenField.value);
  if (token === null) {
    show("The token can only contain printable ASCII characters.", "bad");
    return;
  }
  await chrome.storage.local.set({ focusdeckUrl: url, token });
  urlField.value = url;
  tokenField.value = token;
  await check(url);
});

const settings = readSettings(await chrome.storage.local.get([...STORAGE_KEYS]));
urlField.value = settings.url;
tokenField.value = settings.token;
await check(settings.url);
