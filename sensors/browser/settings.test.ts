import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CATEGORIES, VIA, eventFor } from "./extension/matcher.js";
import { DEFAULT_URL, LOOPBACK_HOSTS, STORAGE_KEYS, normalizeFocusDeckUrl, normalizeToken, readSettings } from "./extension/settings.js";

const here = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
const readJson = (relative: string) => JSON.parse(readFileSync(here(relative), "utf8"));

describe("FocusDeck's address and token", () => {
  it.each([
    ["http://127.0.0.1:3000", "http://127.0.0.1:3000"],
    ["http://127.0.0.1:3000/", "http://127.0.0.1:3000"],
    ["  http://localhost:3000//  ", "http://localhost:3000"],
    ["http://LOCALHOST:8080/focusdeck/", "http://localhost:8080/focusdeck"],
    ["http://127.0.0.1", "http://127.0.0.1"],
  ])("accepts %j as %s", (input, url) => expect(normalizeFocusDeckUrl(input)).toBe(url));

  it.each([
    "https://127.0.0.1:3000",
    "http://192.168.1.20:3000",
    "http://example.com:3000",
    "http://127.0.0.1.evil.example:3000",
    "http://localhost.evil.example",
    "http://[::1]:3000",
    "http://user:pass@127.0.0.1:3000",
    "http://127.0.0.1:3000/?token=t0ken",
    "http://127.0.0.1:3000/#top",
    "127.0.0.1:3000",
    "file:///etc/hosts",
    "",
    null,
    42,
  ])("refuses %j: the extension only talks to FocusDeck on this machine", (input) => expect(normalizeFocusDeckUrl(input)).toBeNull());

  it("defaults to FocusDeck's default address, with no token, whatever storage holds", () => {
    expect(normalizeFocusDeckUrl(DEFAULT_URL)).toBe(DEFAULT_URL);
    expect(readSettings(undefined)).toEqual({ url: DEFAULT_URL, token: "" });
    expect(readSettings({ focusdeckUrl: "https://evil.example", token: "line\nbreak" })).toEqual({ url: DEFAULT_URL, token: "" });
    expect(readSettings({ focusdeckUrl: "http://localhost:3200/", token: " t0ken " })).toEqual({ url: "http://localhost:3200", token: "t0ken" });
    expect(STORAGE_KEYS).toEqual(["focusdeckUrl", "token"]);
  });

  it.each([
    [" t0ken ", "t0ken"],
    ["", ""],
    [undefined, ""],
    ["line\nbreak", null],
    ["tökén", null],
    [42, null],
  ])("normalizes the token %j to %j", (input, token) => expect(normalizeToken(input)).toBe(token));
});

describe("manifests", () => {
  const extension = readJson("./extension/manifest.json");
  const connector = readJson("./manifest.json");

  it("asks the browser for tabs, storage and alarms, plus FocusDeck on this machine, and nothing else", () => {
    expect(extension.manifest_version).toBe(3);
    expect([...extension.permissions].sort()).toEqual(["alarms", "storage", "tabs"]);
    expect(extension.host_permissions).toEqual(LOOPBACK_HOSTS.map((host) => `http://${host}/*`));
    for (const key of ["optional_permissions", "optional_host_permissions", "content_scripts", "web_accessible_resources", "externally_connectable"]) {
      expect(extension).not.toHaveProperty(key);
    }
  });

  it("points at files that exist", () => {
    expect(extension.background).toEqual({ service_worker: "background.js", type: "module" });
    const files = [extension.background.service_worker, extension.options_ui.page, ...Object.values<string>(extension.icons)];
    for (const file of files) expect(existsSync(here(`./extension/${file}`)), file).toBe(true);
  });

  it("describes the connector in the marketplace's shape, matching what the extension sends", () => {
    expect(Object.keys(connector)).toEqual([
      "id", "name", "publisher", "version", "category", "summary", "description", "status",
      "platforms", "emits", "privacy", "requirements", "setup", "test", "docs",
    ]);
    expect(connector).toMatchObject({ id: VIA, publisher: "FocusDeck", version: extension.version, category: "browser" });
    expect(["ready", "spike"]).toContain(connector.status);
    expect(connector.emits.map((e: { kind: string; app: string }) => [e.kind, e.app])).toEqual(CATEGORIES.map((app) => ["app-switch", app]));
    expect(connector.privacy.sends).toEqual(Object.keys(eventFor("browser-x", null) ?? {}));
    expect(connector.setup[0].code.content).toBe("{{FOCUSDECK_DIR}}/sensors/browser/extension");
    expect(existsSync(here("./extension"))).toBe(true);
    expect(connector.docs).toBe("sensors/browser/README.md");
    expect(existsSync(here("./README.md"))).toBe(true);
  });
});
