/**
 * End to end: the real extension in headless Chromium, against a stand-in
 * FocusDeck bridge on loopback.
 *
 * It never reaches the internet:
 * - Chromium resolves the test's hostnames to the stub with
 *   --host-resolver-rules, and every other hostname to nothing.
 * - It runs with no proxy, since a proxy would resolve hostnames itself.
 *
 * Playwright and its Chromium aren't FocusDeck dependencies. Where they aren't
 * installed, the suite is skipped and its name says why.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer, type IncomingHttpHeaders } from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const EXTENSION = fileURLToPath(new URL("./extension", import.meta.url));
const TOKEN = "t0ken-e2e";
const SECRET = "hunter2-do-not-leak";
/** Every hostname the test visits. The stub serves them all. */
const HOSTS = ["x.com", "mobile.x.com", "notx.com", "x.com.evil.example", "developer.mozilla.org", "example.org", "slack.com"];
const BODY = {
  "browser-x": '{"kind":"app-switch","app":"browser-x","via":"browser-extension"}',
  "browser-docs": '{"kind":"app-switch","app":"browser-docs","via":"browser-extension"}',
};
const BOTH_WATCHED = "Connected. Watching Browser — X (1 site) and Browser — docs (1 site).";

// Just the slice of Playwright used here. It isn't a dependency, so its types aren't installed.
interface Page {
  goto(url: string): Promise<unknown>;
  fill(selector: string, value: string): Promise<void>;
  click(selector: string): Promise<void>;
  textContent(selector: string): Promise<string | null>;
  evaluate(expression: string): Promise<unknown>;
  bringToFront(): Promise<void>;
  waitForLoadState(): Promise<void>;
}
interface ServiceWorker {
  url(): string;
  evaluate(expression: string): Promise<unknown>;
}
interface Context {
  serviceWorkers(): ServiceWorker[];
  waitForEvent(event: "serviceworker"): Promise<ServiceWorker>;
  waitForEvent(event: "page"): Promise<Page>;
  newPage(): Promise<Page>;
  close(): Promise<void>;
}
interface Playwright {
  chromium: { executablePath(): string; launchPersistentContext(userDataDir: string, options: object): Promise<Context> };
}

/** Playwright, or why this suite can't run here. */
function findPlaywright(): { playwright: Playwright | null; skip: string | null } {
  let playwright: Playwright;
  try {
    // Resolved like require(), so a global install found through NODE_PATH works too.
    playwright = createRequire(import.meta.url)("playwright") as Playwright;
  } catch {
    return { playwright: null, skip: "Playwright isn't installed (install it, globally with NODE_PATH set, or locally)" };
  }
  if (!existsSync(playwright.chromium.executablePath())) {
    return { playwright: null, skip: "Playwright's Chromium isn't installed (npx playwright install chromium)" };
  }
  return { playwright, skip: null };
}

interface Recorded {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
  body: string;
}

/**
 * A stand-in bridge. It records every call to its API, and serves every
 * "site" as a page whose title holds a secret.
 */
async function stubBridge() {
  const api: Recorded[] = [];
  const state = { config: {} as unknown, eventStatus: 200 };
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const host = req.headers.host ?? "";
      if (!host.startsWith("127.0.0.1:")) {
        res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><title>${SECRET} on ${host}</title><p>${host}</p>`);
        return;
      }
      api.push({ method: req.method ?? "", path: req.url ?? "", headers: req.headers, body });
      const reply = (status: number, value: unknown) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(value));
      if (req.method === "GET" && req.url === "/api/sensor/config") reply(200, state.config);
      else if (req.method === "POST" && req.url === "/api/sensor/events") reply(state.eventStatus, { accepted: state.eventStatus === 200 ? 1 : 0 });
      else reply(404, { error: "not found" });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const close = () => new Promise<void>((done) => { server.closeAllConnections(); server.close(() => done()); });
  return { port, url: `http://127.0.0.1:${port}`, api, state, close };
}

/**
 * GET /api/sensor/config, shaped like FocusDeck's (src/lib/bridge/store.ts).
 * It always lists every category's sites, slack's included, to show that the
 * extension acts only on designated categories it owns.
 */
const bridgeConfig = (designatedApps: string[]) => ({
  configured: true,
  designatedApps,
  kinds: ["app-switch", "notification", "agent-needs-input", "agent-finished", "agent-resumed"],
  fields: ["kind", "app", "source", "at", "via"],
  apps: designatedApps.map((id) => ({ id, bundleIds: [] })),
  sites: { "browser-x": ["x.com"], "browser-docs": ["developer.mozilla.org"], slack: ["slack.com"] },
  tokenRequired: true,
});

const found = findPlaywright();

describe.skipIf(found.skip)(`the extension in headless Chromium${found.skip ? ` (skipped: ${found.skip})` : ""}`, { timeout: 30_000 }, () => {
  let stub: Awaited<ReturnType<typeof stubBridge>>;
  let context: Context;
  let worker: ServiceWorker;
  let profile = "";
  let options: Page; // the extension's options page
  let tab: Page; // a tab in the first window
  let other: Page; // the tab of a second window

  /** The category of every event FocusDeck received, in order. */
  const received = () => stub.api.filter((r) => r.method === "POST").map((r) => (JSON.parse(r.body) as { app: string }).app);
  /** What FocusDeck should have received so far. */
  const expected: string[] = [];

  async function expectSent(category: string) {
    expected.push(category);
    await expect.poll(received, { timeout: 5_000 }).toEqual(expected);
  }

  /** Long enough for the worker to act on the tab (a few ms), then nothing new may have arrived. */
  async function expectNothingSent() {
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(received()).toEqual(expected);
  }

  /** The extension acts on the tab's URL, which a failed load still has, so a failed load is fine here. */
  async function visit(page: Page, url: string) {
    await page.goto(url).catch(() => {});
  }

  /** Re-saves the options, which makes the worker refresh the config, and waits for the result. */
  async function refreshConfig(status: string) {
    await options.evaluate("document.querySelector('form').requestSubmit()");
    await expect.poll(() => options.textContent("#status"), { timeout: 10_000 }).toBe(status);
  }

  beforeAll(async () => {
    if (!found.playwright) throw new Error(found.skip ?? "Playwright is missing");
    stub = await stubBridge();
    stub.state.config = bridgeConfig(["browser-x", "browser-docs", "slack"]);
    profile = mkdtempSync(path.join(tmpdir(), "focusdeck-browser-e2e-"));
    const rules = [...HOSTS.map((host) => `MAP ${host} 127.0.0.1:${stub.port}`), "MAP * ~NOTFOUND", "EXCLUDE 127.0.0.1"].join(", ");
    context = await found.playwright.chromium.launchPersistentContext(profile, {
      channel: "chromium", // full Chromium in new headless mode: the headless shell can't load extensions
      headless: true,
      env: Object.fromEntries(Object.entries(process.env).filter(([key, value]) => value !== undefined && !/_proxy$/i.test(key))),
      args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`, `--host-resolver-rules=${rules}`, "--no-proxy-server"],
    });
    worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  }, 60_000);

  afterAll(async () => {
    await context?.close();
    await stub?.close();
    if (profile) rmSync(profile, { recursive: true, force: true });
  });

  it("takes FocusDeck's URL and token on its options page, then fetches the config with the token", async () => {
    options = await context.newPage();
    await options.goto(`chrome-extension://${new URL(worker.url()).host}/options.html`);
    // Wait for the first check (nothing listens on the default URL) so loading can't overwrite what we type.
    await expect.poll(() => options.textContent("#status"), { timeout: 10_000 }).toMatch(/^(?!Checking)./);
    await options.fill("#url", `${stub.url}/`);
    await options.fill("#token", TOKEN);
    await options.click("button[type=submit]");
    await expect.poll(() => options.textContent("#status"), { timeout: 10_000 }).toBe(BOTH_WATCHED);
    expect(await options.evaluate("document.querySelector('#url').value")).toBe(stub.url);
    const configCalls = stub.api.filter((r) => r.path === "/api/sensor/config");
    expect(configCalls.length).toBeGreaterThan(0);
    for (const call of configCalls) expect(call.headers.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("reports a designated site by category, and nothing for unlisted sites, lookalikes or a repeat", async () => {
    tab = await context.newPage();
    await visit(tab, `http://x.com/home?q=${SECRET}`);
    await expectSent("browser-x");
    await visit(tab, `http://example.org/${SECRET}`); // not listed
    await expectNothingSent();
    await visit(tab, "http://mobile.x.com/"); // X again after an unlisted site: a repeat would give the trip away
    await expectNothingSent();
    await visit(tab, `http://developer.mozilla.org/en-US/docs/${SECRET}#top`);
    await expectSent("browser-docs");
    // With docs sent last, a lookalike taken for X would be sent.
    await visit(tab, "http://notx.com/");
    await expectNothingSent();
    await visit(tab, "http://x.com.evil.example/");
    await expectNothingSent();
    await visit(tab, "http://slack.com/"); // designated in FocusDeck, but not a category this connector reports
    await expectNothingSent();
    await visit(tab, "http://x.com/");
    await expectSent("browser-x");
  });

  it("reports tab activation, and a window gaining focus, but not a window in the background", async () => {
    const second = await context.newPage();
    await visit(second, "http://developer.mozilla.org/"); // a URL change in the active tab
    await expectSent("browser-docs");
    await tab.bringToFront(); // activates the X tab
    await expectSent("browser-x");
    await second.bringToFront();
    await expectSent("browser-docs");

    const opened = context.waitForEvent("page");
    await worker.evaluate("chrome.windows.create({ url: 'http://x.com/', focused: false }).then(() => {})");
    other = await opened;
    await other.waitForLoadState();
    await expectNothingSent(); // its tab changed to X, but it isn't the focused window
    await other.bringToFront(); // now it gains focus
    await expectSent("browser-x");
  });

  it("stops reporting a category once FocusDeck stops designating it", async () => {
    stub.state.config = bridgeConfig(["browser-x"]);
    await refreshConfig("Connected. Watching Browser — X (1 site).");
    await visit(other, "http://developer.mozilla.org/en-US/"); // still listed, no longer designated
    await expectNothingSent();
  });

  it("counts a category as sent only once FocusDeck has accepted it", async () => {
    stub.state.config = bridgeConfig(["browser-x", "browser-docs"]);
    await refreshConfig(BOTH_WATCHED);
    stub.state.eventStatus = 503;
    await visit(other, "http://developer.mozilla.org/en-US/docs/Web"); // FocusDeck refuses this one
    await expectSent("browser-docs");
    stub.state.eventStatus = 200;
    await visit(other, "http://example.org/");
    await expectNothingSent();
    await visit(other, "http://developer.mozilla.org/en-US/docs/Learn"); // so docs is sent again
    await expectSent("browser-docs");
    await visit(other, "http://example.org/");
    await visit(other, "http://developer.mozilla.org/"); // and now it is a repeat
    await expectNothingSent();
  });

  it("sends exactly kind, app and via, with the token, and no URL, title, hostname or tab id", async () => {
    const events = stub.api.filter((r) => r.method === "POST");
    expect(events.map((r) => r.body)).toEqual(expected.map((category) => BODY[category as keyof typeof BODY]));
    for (const request of events) {
      expect(Object.keys(JSON.parse(request.body))).toEqual(["kind", "app", "via"]);
      expect(request.path).toBe("/api/sensor/events");
      expect(request.headers["content-type"]).toBe("application/json");
      expect(request.headers.authorization).toBe(`Bearer ${TOKEN}`);
      expect(request.headers.cookie).toBeUndefined();
      expect(request.headers.referer).toBeUndefined();
    }
    for (const request of stub.api) expect(["/api/sensor/config", "/api/sensor/events"]).toContain(request.path);

    const tabIds = (await worker.evaluate("chrome.tabs.query({}).then((tabs) => tabs.map((t) => String(t.id)))")) as string[];
    expect(tabIds.length).toBeGreaterThan(2);
    const wire = JSON.stringify(stub.api);
    for (const needle of [SECRET, ...HOSTS, "mozilla", "example", "slack", ...tabIds]) expect(wire).not.toContain(needle);

    // What the extension keeps: settings, FocusDeck's own lists and the last category. No browsing.
    const local = (await worker.evaluate("chrome.storage.local.get(null)")) as Record<string, unknown>;
    expect(Object.keys(local).sort()).toEqual(["focusdeckUrl", "token"]);
    const session = (await worker.evaluate("chrome.storage.session.get(null)")) as Record<string, unknown>;
    expect(Object.keys(session).sort()).toEqual(["lastSent", "sites"]);
    const kept = JSON.stringify(session);
    for (const needle of [SECRET, "mobile.x.com", "notx", "evil", "example", "slack", ...tabIds]) expect(kept).not.toContain(needle);
  });
});
