import { isAppId, type AppId } from "./apps";

/**
 * Sites: how a browser tab becomes a category. Telling X from docs needs the
 * tab's hostname, and a URL is content (Privacy Class E). So the browser
 * connector matches the hostname against these lists *in the browser* and
 * sends only the category. The lists travel from FocusDeck to your own
 * connector; hostnames never travel back.
 */
export type SiteLists = Record<string, string[]>;

export const DEFAULT_SITES: SiteLists = {
  "browser-x": ["x.com", "twitter.com"],
  "browser-docs": ["developer.mozilla.org", "docs.github.com", "nextjs.org", "react.dev", "docs.python.org", "doc.rust-lang.org"],
};

export const MAX_SITES_PER_CATEGORY = 100;

const LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const HOST_PATTERN = new RegExp(`^(?=.{1,253}$)${LABEL}(?:\\.${LABEL})*$`);

/** "https://www.X.com/home" → "x.com". Null when it isn't a hostname. */
export function normalizeHostname(input: string): string | null {
  const trimmed = input.trim().toLowerCase().replace(/^\*\./, "");
  if (!trimmed) return null;
  let host: string;
  try {
    host = new URL(trimmed.includes("://") ? trimmed : `http://${trimmed}`).hostname;
  } catch {
    return null;
  }
  // Subdomains already match, so "www." only narrows what the person meant.
  host = host.replace(/\.$/, "").replace(/^www\./, "");
  return HOST_PATTERN.test(host) ? host : null;
}

/** Equal, or a subdomain: mobile.x.com matches x.com; notx.com does not. */
export function hostnameMatches(hostname: string, site: string): boolean {
  return hostname === site || hostname.endsWith(`.${site}`);
}

const cloneSites = (sites: SiteLists): SiteLists => Object.fromEntries(Object.entries(sites).map(([k, v]) => [k, [...v]]));

/**
 * Clean site lists from untrusted input. Keys are app ids (browser categories);
 * each list is deduplicated, normalized and capped. A hostname belongs to one
 * category only: the first list that claims it keeps it.
 */
export function normalizeSites(raw: unknown, fallback: SiteLists = DEFAULT_SITES): SiteLists {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return cloneSites(fallback);
  const claimed = new Set<string>();
  const out: SiteLists = {};
  for (const [key, list] of Object.entries(raw)) {
    if (!isAppId(key) || !Array.isArray(list)) continue;
    const hosts: string[] = [];
    for (const item of list) {
      const host = typeof item === "string" ? normalizeHostname(item) : null;
      if (host && !claimed.has(host) && hosts.length < MAX_SITES_PER_CATEGORY) {
        claimed.add(host);
        hosts.push(host);
      }
    }
    out[key] = hosts;
  }
  return out;
}

/** Only designated categories' lists are handed to a connector. */
export function designatedSites(sites: SiteLists, designated: readonly AppId[]): SiteLists {
  return Object.fromEntries(Object.entries(sites).filter(([key]) => designated.includes(key)).map(([k, v]) => [k, [...v]]));
}

/** Add a site to one category, moving it out of any other. */
export function addSite(sites: SiteLists, category: AppId, input: string): { sites: SiteLists; host: string | null } {
  const host = normalizeHostname(input);
  const current = sites[category] ?? [];
  if (!host || current.includes(host)) return { sites, host };
  if (current.length >= MAX_SITES_PER_CATEGORY) return { sites, host: null };
  const next = Object.fromEntries(Object.entries(sites).map(([k, v]) => [k, v.filter((h) => h !== host)]));
  next[category] = [...current, host];
  return { sites: next, host };
}

export function removeSite(sites: SiteLists, category: AppId, host: string): SiteLists {
  return { ...sites, [category]: (sites[category] ?? []).filter((h) => h !== host) };
}
