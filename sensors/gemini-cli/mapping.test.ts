import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { APP, NEEDS_INPUT_NOTIFICATIONS, VIA, hashSession, toSensorEvent } from "./mapping.mjs";
import { SESSION, SECRET, SOURCE, CONTRACT, meetsContract, intake, common, notification, afterAgent, beforeAgent } from "./fixtures";

describe("Gemini CLI hook → FocusDeck event", () => {
  it.each([
    { hook: "Notification", input: notification, kind: "agent-needs-input" },
    { hook: "AfterAgent", input: afterAgent, kind: "agent-finished" },
    { hook: "BeforeAgent", input: beforeAgent, kind: "agent-resumed" },
  ])("maps $hook to $kind", ({ input, kind }) => {
    expect(toSensorEvent(input)).toEqual({ kind, app: APP, source: SOURCE, via: VIA });
    expect([APP, VIA]).toEqual(["gemini-cli", "gemini-cli"]);
  });

  it("treats a ToolPermission notification as the session being blocked on you", () => {
    expect(NEEDS_INPUT_NOTIFICATIONS).toEqual(["ToolPermission"]);
    expect(toSensorEvent({ ...notification, notification_type: "ToolPermission" })?.kind).toBe("agent-needs-input");
  });

  it.each([undefined, null, "", "toolpermission", "ToolPermissionGranted", "from_the_future", "__proto__"])(
    "drops a notification of type %s: only ToolPermission means you are being waited on",
    (type) => expect(toSensorEvent({ ...notification, notification_type: type })).toBeNull(),
  );

  it.each(["SessionStart", "SessionEnd", "BeforeModel", "AfterModel", "BeforeToolSelection", "BeforeTool", "AfterTool", "PreCompress", "Stop", "", "__proto__", "toString", undefined])(
    "returns null for hook event %s",
    (hook) => expect(toSensorEvent({ ...common, hook_event_name: hook })).toBeNull(),
  );

  it.each([[null], [undefined], ["AfterAgent"], [42], [true], [[]], [[afterAgent]]])("returns null for non-object input %j", (input) => {
    expect(toSensorEvent(input)).toBeNull();
  });
});

describe("Class E: content never leaves the mapping", () => {
  const needles = [SECRET, SESSION, "acme-payroll", ".json", "/Users", "run_shell_command", "curl", "payroll", "password", "Rotated", "Confirm", "2026-11-03"];

  it.each([notification, afterAgent, beforeAgent])("emits only kind, app, source and via for $hook_event_name", (input) => {
    const event = toSensorEvent(input);
    expect(Object.keys(event ?? {}).sort()).toEqual(["app", "kind", "source", "via"]);
    const wire = JSON.stringify(event);
    for (const needle of needles) expect(wire).not.toContain(needle);
  });

  it("builds the event from constants, so input fields named like event fields cannot ride along", () => {
    const sneaky = { ...beforeAgent, kind: "app-switch", app: "slack", source: "alice@example.com", via: "evil", at: 0, url: "https://x.com", title: SECRET };
    expect(toSensorEvent(sneaky)).toEqual({ kind: "agent-resumed", app: "gemini-cli", source: SOURCE, via: "gemini-cli" });
  });

  it.each([notification, afterAgent, beforeAgent])("passes the bridge's intake contract for $hook_event_name", (input) => {
    expect(meetsContract(toSensorEvent(input))).toBe(true);
    if (intake) expect(intake.parseSensorEvent(toSensorEvent(input), Date.now())).toMatchObject({ ok: true, event: { via: "gemini-cli" } });
  });
});

describe("session hashing: stable and opaque", () => {
  it("is the first 16 hex chars of sha256(session_id), and a valid opaque source", () => {
    expect(SOURCE).toBe(createHash("sha256").update(SESSION).digest("hex").slice(0, 16));
    expect(SOURCE).toMatch(/^[0-9a-f]{16}$/);
    expect(SOURCE).toMatch(CONTRACT.source);
  });

  it("is stable per session, distinct across sessions, and reveals nothing of the id", () => {
    expect(toSensorEvent(afterAgent)?.source).toBe(toSensorEvent(beforeAgent)?.source);
    expect(hashSession("11111111-2222-3333-4444-555555555555")).not.toBe(SOURCE);
    expect(SOURCE).not.toBe(SESSION.replace(/-/g, "").slice(0, 16));
    expect(SESSION).not.toContain(SOURCE);
  });

  it.each([undefined, "", 12345, null])("omits source when session_id is %s", (sessionId) => {
    expect(toSensorEvent({ ...afterAgent, session_id: sessionId })).toEqual({ kind: "agent-finished", app: "gemini-cli", via: "gemini-cli" });
  });
});
