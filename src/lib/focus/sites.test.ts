import { describe, expect, it } from "vitest";
import { addSite, designatedSites, hostnameMatches, normalizeHostname, normalizeSites, removeSite } from "./sites";

describe("site lists for the browser connector", () => {
  it("normalizes what people paste into a bare hostname", () => {
    expect(normalizeHostname("https://www.X.com/home?ref=1")).toBe("x.com");
    expect(normalizeHostname("  Developer.Mozilla.org  ")).toBe("developer.mozilla.org");
    expect(normalizeHostname("*.github.com")).toBe("github.com");
    expect(normalizeHostname("localhost:3000")).toBe("localhost");
    expect(normalizeHostname("bücher.de")).toBe("xn--bcher-kva.de");
    for (const bad of ["", "not a host", "http://", "-x.com", "x..com"]) expect(normalizeHostname(bad)).toBeNull();
  });

  it("matches a site and its subdomains, never a lookalike", () => {
    expect(hostnameMatches("x.com", "x.com")).toBe(true);
    expect(hostnameMatches("mobile.x.com", "x.com")).toBe(true);
    expect(hostnameMatches("notx.com", "x.com")).toBe(false);
    expect(hostnameMatches("x.com.evil.net", "x.com")).toBe(false);
  });

  it("keeps each hostname in one category and hands over designated categories only", () => {
    const sites = normalizeSites({ "browser-x": ["x.com"], "browser-docs": ["x.com", "react.dev"] });
    expect(sites).toEqual({ "browser-x": ["x.com"], "browser-docs": ["react.dev"] });
    expect(designatedSites(sites, ["browser-docs"])).toEqual({ "browser-docs": ["react.dev"] });

    const moved = addSite(sites, "browser-docs", "https://x.com/i/lists");
    expect(moved.host).toBe("x.com");
    expect(moved.sites).toEqual({ "browser-x": [], "browser-docs": ["react.dev", "x.com"] });
    expect(addSite(sites, "browser-x", "???").host).toBeNull();
    expect(removeSite(moved.sites, "browser-docs", "react.dev")["browser-docs"]).toEqual(["x.com"]);
  });
});
