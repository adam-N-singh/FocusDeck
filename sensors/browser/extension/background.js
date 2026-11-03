/**
 * FocusDeck's browser connector: the service worker.
 *
 * When the active tab of the focused window switches to a site FocusDeck
 * designated, it POSTs the category and nothing else:
 *   {"kind":"app-switch","app":"browser-x","via":"browser-extension"}
 * The URL is reduced to a hostname and matched here, in the browser, then
 * dropped (Privacy Class E). See README.md.
 *
 * It must never get in the browser's way, so it uses 2 s timeouts, no
 * retries, no queue of your activity, and every failure is silent.
 */
import { categoryForUrl, eventFor, sitesFromConfig } from "./matcher.js";
import { STORAGE_KEYS, readSettings } from "./settings.js";

const TIMEOUT_MS = 2_000;
const REFRESH_ALARM = "refresh-config";
const REFRESH_MINUTES = 1;

/**
 * @typedef {{ state: "connected", watching: { app: string, sites: number }[] }
 *   | { state: "unconfigured" | "unreachable" }
 *   | { state: "unauthorized" | "error", code: number }} Status
 */

/**
 * @param {string} path
 * @param {RequestInit} [init]
 */
async function callFocusDeck(path, init = {}) {
  const { url, token } = readSettings(await chrome.storage.local.get([...STORAGE_KEYS]));
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${url}${path}`, {
    ...init,
    headers,
    cache: "no-store",
    credentials: "omit", // FocusDeck needs no cookies, so none are sent
    redirect: "error", // never follow FocusDeck's address anywhere else, token in hand
    referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

// --- Config ---------------------------------------------------------------
// Fetched when the browser starts, every minute (an alarm), and when the
// options are saved. It is never fetched because of a tab switch: that
// request's timing would tell FocusDeck when you switched, even to sites it
// may not see. The lists live in storage.session, which is memory only. It
// survives the worker sleeping and is gone when the browser quits.

/** @type {Promise<unknown>} Refreshes run one at a time, in order. */
let refreshing = Promise.resolve();

/** @returns {Promise<Status>} */
function refreshConfig() {
  const run = refreshing.then(fetchConfig);
  refreshing = run;
  return run;
}

/** @returns {Promise<Status>} What the options page shows. Never rejects. */
async function fetchConfig() {
  /** @type {import("./matcher.js").Sites} */
  let sites = {};
  /** @type {Status} */
  let status = { state: "unreachable" };
  try {
    const response = await callFocusDeck("/api/sensor/config");
    status = { state: response.status === 401 ? "unauthorized" : "error", code: response.status };
    const config = response.ok ? await response.json() : null;
    if (typeof config === "object" && config !== null && !Array.isArray(config)) {
      sites = sitesFromConfig(config);
      status = config.configured === false
        ? { state: "unconfigured" }
        : { state: "connected", watching: Object.entries(sites).map(([app, hosts]) => ({ app, sites: hosts.length })) };
    }
  } catch {
    // The status says how far it got.
  }
  try {
    // A failed refresh empties the lists. A category the connector doesn't
    // know is designated is never sent.
    await chrome.storage.session.set({ sites });
  } catch {
    // Nothing more to do.
  }
  return status;
}

/** Creates the refresh alarm, or replaces it. */
function scheduleRefreshes() {
  // create() returns a promise from Chrome 111, and nothing before that.
  return Promise.resolve(chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: REFRESH_MINUTES })).catch(() => {});
}

function start() {
  void scheduleRefreshes();
  void refreshConfig();
}

chrome.runtime.onStartup.addListener(start);
chrome.runtime.onInstalled.addListener(start);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM) void refreshConfig();
});
// Alarms usually survive restarts, but that isn't guaranteed. If it's gone,
// put it back; the next refresh is then a minute away.
chrome.alarms
  .get(REFRESH_ALARM)
  .then((alarm) => alarm ?? scheduleRefreshes())
  .catch(() => {});

// The options page asks for a refresh after saving, and shows the answer.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || message?.type !== "refresh") return false;
  refreshConfig().then(sendResponse);
  return true; // answers asynchronously
});

// --- Switches -------------------------------------------------------------

/**
 * The focused window's active tab, as a category or null. This is the only
 * place a URL is read. It is reduced to a hostname, matched, and dropped.
 * @param {import("./matcher.js").Sites} sites
 */
async function activeCategory(sites) {
  const focused = await chrome.windows.getLastFocused();
  if (!focused.focused) return null; // the browser isn't in front, so no tab is being looked at
  const [tab] = await chrome.tabs.query({ active: true, windowId: focused.id });
  return categoryForUrl(tab?.url, sites);
}

/** @param {import("./matcher.js").SwitchEvent} event */
async function send(event) {
  try {
    const response = await callFocusDeck("/api/sensor/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function syncOnce() {
  await refreshing; // a refresh already under way (browser start, saved options) goes first
  const { sites = {}, lastSent = null } = await chrome.storage.session.get(["sites", "lastSent"]);
  const event = eventFor(await activeCategory(sites), lastSent);
  // Unlisted, undesignated or unchanged: send nothing, and keep lastSent.
  if (event === null) return;
  // lastSent counts only what FocusDeck accepted. If FocusDeck was down, the
  // next switch to this category is sent again.
  if (await send(event)) await chrome.storage.session.set({ lastSent: event.app });
}

/** @type {Promise<void> | null} */
let syncing = null;
let again = false;

/**
 * Every trigger re-reads the active tab, so a pass only ever acts on the
 * present. One pass runs at a time, and triggers that arrive during it fold
 * into one more pass.
 */
function requestSync() {
  if (syncing) {
    again = true;
    return;
  }
  syncing = (async () => {
    do {
      again = false;
      try {
        await syncOnce();
      } catch {
        // Fail silently. The next switch starts afresh.
      }
    } while (again);
    syncing = null;
  })();
}

chrome.tabs.onActivated.addListener(() => requestSync());
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.url !== undefined && tab.active) requestSync();
});
chrome.windows.onFocusChanged.addListener((windowId) => {
  // WINDOW_ID_NONE: you left the browser. Nothing is sent, and nothing is reset.
  if (windowId !== chrome.windows.WINDOW_ID_NONE) requestSync();
});
