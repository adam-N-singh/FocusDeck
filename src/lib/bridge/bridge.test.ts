import { beforeEach, describe, expect, it } from "vitest";
import { parseSensorBatch, parseSensorEvent } from "./intake";
import { getConfig, ingest, readSince, resetBridge, setConfig } from "./store";
import { checkTrust, hostName, safeEqual, type RequestFacts } from "./trust";

const NOW = Date.parse("2026-10-31T15:00:00Z");

describe("sensor intake: metadata only, by construction", () => {
  it("accepts the four metadata fields", () => {
    const result = parseSensorEvent({ kind: "agent-needs-input", app: "claude-code", source: "a1b2c3", at: NOW - 1000 }, NOW);
    expect(result).toEqual({ ok: true, event: { kind: "agent-needs-input", app: "claude-code", source: "a1b2c3", at: NOW - 1000 } });
  });

  it.each(["title", "message", "body", "url", "windowTitle", "prompt"])("rejects any event carrying a %s field (Class E)", (field) => {
    const result = parseSensorEvent({ kind: "notification", app: "slack", [field]: "secret" }, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain(`"${field}" is not accepted`);
      expect(result.reason).not.toContain("secret");
    }
  });

  it("rejects unknown apps, unknown kinds, non-opaque sources and wild timestamps", () => {
    expect(parseSensorEvent({ kind: "app-switch", app: "Photoshop" }, NOW).ok).toBe(false);
    expect(parseSensorEvent({ kind: "keystroke", app: "editor" }, NOW).ok).toBe(false);
    expect(parseSensorEvent({ kind: "agent-finished", app: "claude-code", source: "user@example.com" }, NOW).ok).toBe(false);
    expect(parseSensorEvent({ kind: "app-switch", app: "editor", at: NOW + 60 * 60 * 1000 }, NOW).ok).toBe(false);
    expect(parseSensorEvent({ kind: "app-switch", app: "editor", at: "2026-10-31T14:59:00Z" }, NOW).ok).toBe(true);
  });

  it("accepts a single event, an array, or an events envelope — nothing else in the envelope", () => {
    expect(parseSensorBatch({ kind: "app-switch", app: "editor" }, NOW).events).toHaveLength(1);
    expect(parseSensorBatch([{ kind: "app-switch", app: "editor" }, { kind: "bad" }], NOW).rejected).toHaveLength(1);
    expect(parseSensorBatch({ events: [{ kind: "app-switch", app: "editor" }] }, NOW).events).toHaveLength(1);
    expect(parseSensorBatch({ events: [], note: "hi" }, NOW).rejected[0].reason).toMatch(/only contain/);
  });
});

describe("bridge buffer", () => {
  beforeEach(() => resetBridge());

  it("sees nothing until the app has said which apps are designated", () => {
    const result = ingest({ kind: "app-switch", app: "editor" }, NOW);
    expect(result).toMatchObject({ accepted: 0, dropped: 1, configured: false });
    expect(readSince(0).events).toHaveLength(0);
  });

  it("re-filters undesignated apps at the bridge (defense in depth) and serves events after a cursor", () => {
    setConfig({ designatedApps: ["editor", "claude-code", "not-an-app"] }, NOW);
    expect(getConfig().designatedApps).toEqual(["editor", "claude-code"]);
    const result = ingest([{ kind: "app-switch", app: "editor" }, { kind: "app-switch", app: "browser-x" }, { kind: "agent-finished", app: "claude-code" }], NOW);
    expect(result).toMatchObject({ accepted: 2, dropped: 1 });
    const first = readSince(0);
    expect(first.events.map((e) => e.seq)).toEqual([1, 2]);
    expect(readSince(first.lastSeq).events).toHaveLength(0);
    expect(first.stats).toMatchObject({ accepted: 2, dropped: 1, rejected: 0 });
  });

  it("tells sensors only the designated apps and their native ids", () => {
    setConfig({ designatedApps: ["terminal"] }, NOW);
    expect(getConfig().apps).toEqual([{ id: "terminal", bundleIds: expect.arrayContaining(["com.apple.Terminal"]) }]);
  });
});

describe("bridge trust", () => {
  const facts = (partial: Partial<RequestFacts>): RequestFacts => ({
    host: "localhost:3000", origin: null, secFetchSite: null, contentType: "application/json", authorization: null, ...partial,
  });

  it("answers on loopback only", () => {
    expect(checkTrust(facts({ host: "192.168.1.5:3000" }), {}, "read").ok).toBe(false);
    expect(checkTrust(facts({ host: "evil.example" }), {}, "read").ok).toBe(false); // DNS rebinding
    expect(checkTrust(facts({ host: "[::1]:3000" }), {}, "read").ok).toBe(true);
    expect(hostName("[::1]:3000")).toBe("[::1]");
  });

  it("refuses cross-site browser requests and non-JSON writes (CSRF)", () => {
    expect(checkTrust(facts({ secFetchSite: "cross-site" }), {}, "write").ok).toBe(false);
    expect(checkTrust(facts({ origin: "https://evil.example" }), {}, "write").ok).toBe(false);
    expect(checkTrust(facts({ contentType: "text/plain" }), {}, "write")).toMatchObject({ ok: false, status: 415 });
  });

  it("requires the token from every client once one is configured — a same-origin header is spoofable", () => {
    const config = { token: "s3cret-token" };
    expect(checkTrust(facts({}), config, "write")).toMatchObject({ ok: false, status: 401 });
    expect(checkTrust(facts({ secFetchSite: "same-origin", origin: "http://localhost:3000" }), config, "write-config")).toMatchObject({ ok: false, status: 401 });
    expect(checkTrust(facts({ authorization: "Bearer s3cret-token" }), config, "write")).toEqual({ ok: true, via: "sensor" });
    expect(checkTrust(facts({ secFetchSite: "same-origin", authorization: "Bearer s3cret-token" }), config, "write-config")).toEqual({ ok: true, via: "browser" });
  });

  it("lets only the app itself change which apps are designated", () => {
    expect(checkTrust(facts({}), {}, "write-config").ok).toBe(false);
    expect(checkTrust(facts({ secFetchSite: "same-origin" }), {}, "write-config").ok).toBe(true);
  });

  it("compares tokens in constant time", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
