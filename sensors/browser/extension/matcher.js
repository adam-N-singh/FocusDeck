/**
 * FocusDeck's browser connector, the pure part: tab URL in, category or
 * nothing out. The service worker and the tests share it. It has no chrome.*
 * calls and no I/O.
 *
 * Telling X from docs needs the tab's hostname, and a URL is content (Privacy
 * Class E). So the URL is reduced to its hostname, the hostname is compared
 * with the site lists FocusDeck handed over, and both are dropped right here.
 * Hostnames never travel back. Events are built from constants, never by
 * copying the config or the tab, so nothing else can ride along.
 */

/** @typedef {"browser-x" | "browser-docs"} Category */
/** @typedef {Partial<Record<Category, string[]>>} Sites Designated categories and their hostnames. */
/** @typedef {{ kind: "app-switch", app: Category, via: "browser-extension" }} SwitchEvent */

/**
 * The only categories this connector reports, as FocusDeck catalog ids.
 * @type {readonly Category[]}
 */
export const CATEGORIES = Object.freeze(["browser-x", "browser-docs"]);

/** This connector's id, sent as `via` so FocusDeck can show its status. */
export const VIA = "browser-extension";

const LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
/** A plain DNS hostname, with no scheme, port, path or wildcard. */
const HOSTNAME = new RegExp(`^(?=.{1,253}$)${LABEL}(?:\\.${LABEL})*$`);

const isRecord = (/** @type {unknown} */ value) => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * A site from FocusDeck's config, as a lowercase hostname, or null.
 * FocusDeck normalizes its lists already. This only refuses what isn't a
 * hostname, so a stray "https://…" or "*.x.com" matches nothing.
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeSite(value) {
  if (typeof value !== "string") return null;
  const host = value.trim().toLowerCase().replace(/\.$/, "");
  return HOSTNAME.test(host) ? host : null;
}

/**
 * The hostname of an http(s) URL: lowercase, punycode and without a trailing
 * dot. Anything else (chrome://, file:, about:blank, the new tab page) gives
 * null.
 * @param {unknown} url
 * @returns {string | null}
 */
export function hostnameOf(url) {
  if (typeof url !== "string") return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return parsed.hostname.replace(/\.$/, "") || null;
}

/**
 * True when the hostname equals the site or is a subdomain of it.
 * mobile.x.com matches x.com. notx.com and x.com.evil.example don't.
 * @param {string} hostname
 * @param {string} site
 */
export function hostnameMatches(hostname, site) {
  return hostname === site || hostname.endsWith(`.${site}`);
}

/**
 * Turns the answer of GET /api/sensor/config into the site lists this
 * connector may use.
 *
 * A category is kept only if it is one of CATEGORIES *and* FocusDeck lists it
 * in designatedApps. The bridge filters too; this is defense in depth. A
 * malformed answer, or a bridge that isn't configured yet, gives no sites.
 * @param {unknown} config
 * @returns {Sites}
 */
export function sitesFromConfig(config) {
  /** @type {Sites} */
  const sites = {};
  if (!isRecord(config) || config.configured === false) return sites;
  const designated = Array.isArray(config.designatedApps) ? config.designatedApps : [];
  const lists = isRecord(config.sites) ? config.sites : {};
  for (const category of CATEGORIES) {
    if (!designated.includes(category)) continue;
    const list = Object.hasOwn(lists, category) ? lists[category] : undefined;
    const hosts = Array.isArray(list) ? list.map(normalizeSite).filter((host) => host !== null) : [];
    sites[category] = [...new Set(hosts)];
  }
  return sites;
}

/**
 * The category a hostname belongs to, or null.
 *
 * The most specific site wins, so developer.mozilla.org beats mozilla.org. A
 * hostname that both categories claim equally is ambiguous, so it maps to
 * nothing.
 * @param {string | null} hostname
 * @param {Sites} sites
 * @returns {Category | null}
 */
export function categoryFor(hostname, sites) {
  if (!hostname) return null;
  /** @type {Category | null} */
  let best = null;
  let bestLength = 0;
  let tie = false;
  for (const category of CATEGORIES) {
    const list = isRecord(sites) ? sites[category] : undefined;
    for (const site of Array.isArray(list) ? list : []) {
      if (typeof site !== "string" || !hostnameMatches(hostname, site) || site.length < bestLength) continue;
      if (site.length > bestLength) {
        best = category;
        bestLength = site.length;
        tie = false;
      } else if (category !== best) {
        tie = true;
      }
    }
  }
  return tie ? null : best;
}

/**
 * A tab URL's category, or null.
 * @param {unknown} url
 * @param {Sites} sites
 * @returns {Category | null}
 */
export function categoryForUrl(url, sites) {
  return categoryFor(hostnameOf(url), sites);
}

/**
 * What to send when the active tab shows `category`, given the last category
 * FocusDeck accepted. Null means send nothing:
 * - A site that isn't listed (null) sends nothing, and the caller keeps
 *   lastSent as it was. Resetting it would turn x → unlisted → x into a
 *   telltale repeat, which would reveal that something unseen happened in
 *   between.
 * - The same category again sends nothing either.
 * @param {unknown} category
 * @param {unknown} lastSent
 * @returns {SwitchEvent | null}
 */
export function eventFor(category, lastSent) {
  const app = CATEGORIES.find((known) => known === category);
  if (app === undefined || app === lastSent) return null;
  return { kind: "app-switch", app, via: VIA };
}
