import { describe, expect, it } from "vitest";
import { CATEGORIES, VIA, categoryFor, categoryForUrl, eventFor, hostnameMatches, hostnameOf, normalizeSite, sitesFromConfig } from "./extension/matcher.js";

const SECRET = "hunter2-do-not-leak";

/** GET /api/sensor/config, shaped like FocusDeck's (src/lib/bridge/store.ts), with the new `sites`. */
const CONFIG = {
  configured: true,
  designatedApps: ["browser-x", "browser-docs", "editor"],
  kinds: ["app-switch", "notification", "agent-needs-input", "agent-finished", "agent-resumed"],
  fields: ["kind", "app", "source", "at", "via"],
  apps: [{ id: "editor", bundleIds: ["com.microsoft.VSCode"] }],
  sites: { "browser-x": ["x.com", "twitter.com"], "browser-docs": ["developer.mozilla.org", "docs.github.com"] },
  tokenRequired: false,
};
const SITES = sitesFromConfig(CONFIG);

type SwitchEvent = NonNullable<ReturnType<typeof eventFor>>;

/**
 * Feeds tab URLs through matching and de-dup the way the service worker does,
 * with FocusDeck accepting every event. Returns what FocusDeck would receive.
 */
function journey(urls: unknown[], sites = SITES): SwitchEvent[] {
  const sent: SwitchEvent[] = [];
  let lastSent: string | null = null;
  for (const url of urls) {
    const event = eventFor(categoryForUrl(url, sites), lastSent);
    if (event === null) continue;
    sent.push(event);
    lastSent = event.app;
  }
  return sent;
}
const apps = (events: SwitchEvent[]) => events.map((event) => event.app);

describe("hostname matching", () => {
  it.each([
    ["x.com", "x.com"],
    ["mobile.x.com", "x.com"],
    ["a.b.x.com", "x.com"],
    ["www.developer.mozilla.org", "developer.mozilla.org"],
  ])("%s matches %s", (hostname, site) => expect(hostnameMatches(hostname, site)).toBe(true));

  it.each([
    ["notx.com", "x.com"],
    ["xx.com", "x.com"],
    ["x.com.evil.example", "x.com"],
    ["x.co", "x.com"],
    ["x.comm", "x.com"],
    ["mobile-x.com", "x.com"],
    ["mozilla.org", "developer.mozilla.org"],
    ["developer-mozilla.org", "developer.mozilla.org"],
    ["", "x.com"],
  ])("lookalike %j does not match %s", (hostname, site) => expect(hostnameMatches(hostname, site)).toBe(false));

  it.each([
    ["https://x.com/home", "browser-x"],
    ["http://x.com", "browser-x"],
    ["https://mobile.x.com/i/flow/login?redirect=1", "browser-x"],
    ["https://X.COM./", "browser-x"],
    ["https://x.com:8443/", "browser-x"],
    ["https://twitter.com/settings", "browser-x"],
    ["https://developer.mozilla.org/en-US/docs/Web#top", "browser-docs"],
    ["https://docs.github.com/en", "browser-docs"],
  ])("puts %s in %s", (url, category) => expect(categoryForUrl(url, SITES)).toBe(category));

  it.each([
    "https://notx.com/",
    "https://x.com.evil.example/",
    "https://evil.example/x.com",
    "https://evil.example/?next=https://x.com/",
    "https://evil.example/#x.com",
    "https://x.com@evil.example/",
    "https://user:pass@evil.example/",
    "https://github.com/",
    "https://mozilla.org/",
  ])("matches nothing for %s", (url) => expect(categoryForUrl(url, SITES)).toBeNull());

  it.each([
    "chrome://newtab/",
    "chrome-extension://abcdefghijklmnopabcdefghijklmnop/options.html",
    "file:///home/me/x.com/notes.html",
    "about:blank",
    "data:text/html,x.com",
    "view-source:https://x.com/",
    "blob:https://x.com/0c0b6a5e-6d5f-4a59-a6b8-2f1e0c9e8f00",
    "javascript:alert('x.com')",
    "x.com",
    "",
    "not a url",
    undefined,
    null,
    42,
  ])("only http(s) tabs count, so %j is nothing", (url) => {
    expect(hostnameOf(url)).toBeNull();
    expect(categoryForUrl(url, SITES)).toBeNull();
  });

  it("compares punycode, as Chromium reports internationalized hostnames", () => {
    const sites = sitesFromConfig({ ...CONFIG, sites: { "browser-x": ["xn--bcher-kva.example"] } });
    expect(hostnameOf("https://bücher.example/")).toBe("xn--bcher-kva.example");
    expect(categoryForUrl("https://bücher.example/", sites)).toBe("browser-x");
  });

  it("lets the most specific site win, and maps a tie between categories to nothing", () => {
    const nested = { "browser-x": ["mozilla.org"], "browser-docs": ["developer.mozilla.org"] };
    expect(categoryFor("developer.mozilla.org", nested)).toBe("browser-docs");
    expect(categoryFor("www.developer.mozilla.org", nested)).toBe("browser-docs");
    expect(categoryFor("addons.mozilla.org", nested)).toBe("browser-x");
    expect(categoryFor("x.com", { "browser-x": ["x.com"], "browser-docs": ["x.com"] })).toBeNull();
    expect(categoryFor("x.com", { "browser-x": ["x.com", "x.com"] })).toBe("browser-x");
  });
});

describe("site lists from FocusDeck's config", () => {
  it("keeps the two categories' lists, normalized, deduplicated and stripped of anything that isn't a hostname", () => {
    const sites = sitesFromConfig({
      ...CONFIG,
      sites: { "browser-x": [" X.com. ", "x.com", "https://twitter.com/", "*.x.com", "x.com/home", "x.com:443", "-x.com", "x..com", "", 42, null], "browser-docs": [] },
    });
    expect(sites).toEqual({ "browser-x": ["x.com"], "browser-docs": [] });
    expect(normalizeSite("Developer.Mozilla.org")).toBe("developer.mozilla.org");
  });

  it("drops every category FocusDeck doesn't designate", () => {
    expect(sitesFromConfig({ ...CONFIG, designatedApps: ["browser-docs"] })).toEqual({ "browser-docs": ["developer.mozilla.org", "docs.github.com"] });
    expect(sitesFromConfig({ ...CONFIG, designatedApps: [] })).toEqual({});
    expect(sitesFromConfig({ ...CONFIG, configured: false })).toEqual({});
  });

  it("ignores lists for anything but its two categories, even designated ones", () => {
    const sites = sitesFromConfig({
      ...CONFIG,
      designatedApps: ["browser-x", "slack", "browser-github", "__proto__", "constructor"],
      sites: { "browser-x": ["x.com"], slack: ["slack.com"], "browser-github": ["github.com"], constructor: ["evil.example"] },
    });
    expect(sites).toEqual({ "browser-x": ["x.com"] });
    expect(categoryForUrl("https://slack.com/", sites)).toBeNull();
    expect(categoryForUrl("https://github.com/", sites)).toBeNull();
  });

  it.each([
    null,
    undefined,
    "x.com",
    42,
    [],
    {},
    { designatedApps: "browser-x", sites: CONFIG.sites },
    { designatedApps: ["browser-x"], sites: [["x.com"]] },
    { designatedApps: ["browser-x"], sites: { "browser-x": "x.com" } },
    { designatedApps: ["browser-x"], sites: Object.create({ "browser-x": ["x.com"] }) },
  ])("finds no sites in a malformed config: %j", (config) => {
    const sites = sitesFromConfig(config);
    expect(Object.values(sites).flat()).toEqual([]);
    expect(categoryForUrl("https://x.com/", sites)).toBeNull();
  });
});

describe("de-duplication", () => {
  it("sends consecutive switches within one category once", () => {
    expect(apps(journey(["https://x.com/", "https://x.com/home", "https://mobile.x.com/", "https://twitter.com/"]))).toEqual(["browser-x"]);
  });

  it("is not reset by unlisted sites, so X → unlisted → X is no telltale repeat", () => {
    expect(apps(journey(["https://x.com/", "https://example.org/", "https://x.com/"]))).toEqual(["browser-x"]);
    expect(apps(journey(["https://x.com/", "chrome://newtab/", "about:blank", "https://notx.com/", "https://example.org/", "https://mobile.x.com/"]))).toEqual(["browser-x"]);
  });

  it("sends every change of category, even across unlisted sites", () => {
    const urls = ["https://example.org/", "https://x.com/", "https://developer.mozilla.org/", "https://example.org/", "https://docs.github.com/", "https://x.com/"];
    expect(apps(journey(urls))).toEqual(["browser-x", "browser-docs", "browser-x"]);
  });

  it("sends nothing for unlisted sites at all", () => {
    expect(journey(["https://example.org/", "about:blank", "https://notx.com/", "https://x.com.evil.example/"])).toEqual([]);
  });

  it("decides from the category and the last one FocusDeck accepted", () => {
    expect(eventFor("browser-x", null)).toEqual({ kind: "app-switch", app: "browser-x", via: "browser-extension" });
    expect(eventFor("browser-x", "browser-docs")?.app).toBe("browser-x");
    expect(eventFor("browser-x", "browser-x")).toBeNull();
    expect(eventFor(null, "browser-x")).toBeNull();
    expect(eventFor(null, null)).toBeNull();
  });
});

describe("undesignated categories are never reported", () => {
  const urls = ["https://x.com/", "https://developer.mozilla.org/", "https://x.com/", "https://docs.github.com/"];

  it("reports only what FocusDeck designates", () => {
    expect(apps(journey(urls, sitesFromConfig({ ...CONFIG, designatedApps: ["browser-docs"] })))).toEqual(["browser-docs"]);
    expect(apps(journey(urls, sitesFromConfig({ ...CONFIG, designatedApps: ["browser-x"] })))).toEqual(["browser-x"]);
  });

  it("reports nothing when nothing is designated, the bridge isn't configured, or the config is unreadable", () => {
    expect(journey(urls, sitesFromConfig({ ...CONFIG, designatedApps: ["editor", "slack"] }))).toEqual([]);
    expect(journey(urls, sitesFromConfig({ ...CONFIG, configured: false }))).toEqual([]);
    expect(journey(urls, sitesFromConfig(null))).toEqual([]);
  });

  it.each(["slack", "editor", "browser-github", "BROWSER-X", "__proto__", "constructor", "", 42, undefined, { app: "browser-x" }])(
    "never builds an event for %j",
    (category) => expect(eventFor(category, null)).toBeNull(),
  );
});

describe("the payload", () => {
  it.each(CATEGORIES)("is exactly kind, app and via for %s", (category) => {
    const event = eventFor(category, null);
    expect(Object.keys(event ?? {})).toEqual(["kind", "app", "via"]);
    expect(JSON.stringify(event)).toBe(`{"kind":"app-switch","app":"${category}","via":"browser-extension"}`);
    expect(VIA).toBe("browser-extension");
  });

  it("carries nothing of the URLs it was decided from", () => {
    const urls = [
      `https://x.com/${SECRET}/status/1234567890?ref=${SECRET}#${SECRET}`,
      `https://example.org/${SECRET}`,
      `https://${SECRET}@developer.mozilla.org/en-US/docs/${SECRET}`,
      `https://mobile.x.com/search?q=${SECRET}`,
    ];
    const events = journey(urls);
    expect(apps(events)).toEqual(["browser-x", "browser-docs", "browser-x"]);
    const wire = JSON.stringify(events);
    for (const needle of [SECRET, "x.com", "mobile", "mozilla", "example", "http", "1234567890", "?", "#", "@", "/"]) expect(wire).not.toContain(needle);
  });
});
