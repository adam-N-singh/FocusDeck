import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { APP, VIA, fromHook, fromNotify, hashSession } from "./mapping.mjs";
import { SESSION, SECRET, SOURCE, CONTRACT, meetsContract, intake, common, permission, stop, prompt, notify } from "./fixtures";

describe("Codex input → FocusDeck event", () => {
  it.each([
    { hook: "PermissionRequest", input: permission, kind: "agent-needs-input" },
    { hook: "Stop", input: stop, kind: "agent-finished" },
    { hook: "UserPromptSubmit", input: prompt, kind: "agent-resumed" },
  ])("maps the $hook hook to $kind", ({ input, kind }) => {
    expect(fromHook(input)).toEqual({ kind, app: APP, source: SOURCE, via: VIA });
    expect([APP, VIA]).toEqual(["codex", "codex"]);
  });

  it("maps notify's agent-turn-complete to agent-finished, with the same source as the session's hooks", () => {
    expect(fromNotify(notify)).toEqual({ kind: "agent-finished", app: "codex", source: SOURCE, via: "codex" });
    expect(fromNotify(notify)?.source).toBe(fromHook(stop)?.source);
  });

  it("treats a subagent's permission request as the session being blocked on you", () => {
    const fromSubagent = { ...permission, agent_id: "019a4f30-1111-7222-8333-444455556666", agent_type: "explorer" };
    expect(fromHook(fromSubagent)).toEqual({ kind: "agent-needs-input", app: "codex", source: SOURCE, via: "codex" });
  });

  it.each(["019a4f30-1111-7222-8333-444455556666", ""])("drops a subagent's prompt (agent_id %j): its parent wrote it, not you", (agentId) => {
    expect(fromHook({ ...prompt, agent_id: agentId, agent_type: "explorer" })).toBeNull();
  });

  it.each(["PreToolUse", "PostToolUse", "SessionStart", "SessionEnd", "SubagentStart", "SubagentStop", "PreCompact", "PostCompact", "Interrupt", "PreModelRequest", "PostModelRequest", "", "__proto__", "toString", undefined])(
    "returns null for hook event %s",
    (hook) => expect(fromHook({ ...common, hook_event_name: hook })).toBeNull(),
  );

  it.each(["approval-requested", "agent-turn-start", "from_the_future", "__proto__", "", undefined])("returns null for notify type %s", (type) => {
    expect(fromNotify({ ...notify, type })).toBeNull();
  });

  it("does not read a hook input as a notify payload, or the other way round", () => {
    expect(fromHook(notify)).toBeNull();
    expect(fromNotify(stop)).toBeNull();
  });

  it.each([[null], [undefined], ["Stop"], [42], [true], [[]], [[stop]], [[notify]]])("returns null for non-object input %j", (input) => {
    expect(fromHook(input)).toBeNull();
    expect(fromNotify(input)).toBeNull();
  });
});

describe("Class E: content never leaves the mapping", () => {
  const needles = [SECRET, SESSION, "acme-payroll", ".jsonl", "/Users", "Bash", "curl", "payroll", "password", "Rotated", "gpt-5", "codex-tui", "12345"];

  it.each([
    { name: "PermissionRequest", event: () => fromHook(permission) },
    { name: "Stop", event: () => fromHook(stop) },
    { name: "UserPromptSubmit", event: () => fromHook(prompt) },
    { name: "notify", event: () => fromNotify(notify) },
  ])("emits only kind, app, source and via for $name", ({ event }) => {
    expect(Object.keys(event() ?? {}).sort()).toEqual(["app", "kind", "source", "via"]);
    const wire = JSON.stringify(event());
    for (const needle of needles) expect(wire).not.toContain(needle);
  });

  it("builds the event from constants, so input fields named like event fields cannot ride along", () => {
    const sneaky = { kind: "app-switch", app: "slack", source: "alice@example.com", via: "evil", at: 0, url: "https://x.com", title: SECRET };
    expect(fromHook({ ...prompt, ...sneaky, hook_event_name: "UserPromptSubmit" })).toEqual({ kind: "agent-resumed", app: "codex", source: SOURCE, via: "codex" });
    expect(fromNotify({ ...notify, ...sneaky, type: "agent-turn-complete" })).toEqual({ kind: "agent-finished", app: "codex", source: SOURCE, via: "codex" });
  });

  it.each([permission, stop, prompt])("passes the bridge's intake contract for $hook_event_name", (input) => {
    for (const event of [fromHook(input), fromNotify(notify)]) {
      expect(meetsContract(event)).toBe(true);
      if (intake) expect(intake.parseSensorEvent(event, Date.now())).toMatchObject({ ok: true, event: { via: "codex" } });
    }
  });
});

describe("session hashing: stable and opaque", () => {
  it("is the first 16 hex chars of sha256(session id), and a valid opaque source", () => {
    expect(SOURCE).toBe(createHash("sha256").update(SESSION).digest("hex").slice(0, 16));
    expect(SOURCE).toMatch(/^[0-9a-f]{16}$/);
    expect(SOURCE).toMatch(CONTRACT.source);
  });

  it("is stable per session, distinct across sessions, and reveals nothing of the id", () => {
    expect(fromHook(permission)?.source).toBe(fromHook(prompt)?.source);
    expect(hashSession("019a4f2e-0000-7000-8000-000000000000")).not.toBe(SOURCE);
    expect(SOURCE).not.toBe(SESSION.replace(/-/g, "").slice(0, 16));
    expect(SESSION).not.toContain(SOURCE);
  });

  it.each([undefined, "", 12345, null])("omits source when the session id is %s", (id) => {
    expect(fromHook({ ...stop, session_id: id })).toEqual({ kind: "agent-finished", app: "codex", via: "codex" });
    expect(fromNotify({ ...notify, "thread-id": id })).toEqual({ kind: "agent-finished", app: "codex", via: "codex" });
  });
});
