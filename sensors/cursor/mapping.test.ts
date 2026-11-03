import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { APP, FINISHED_STATUSES, VIA, hashConversation, toSensorEvent } from "./mapping.mjs";
import { CONVERSATION, SECRET, SOURCE, CONTRACT, meetsContract, intake, common, stop, prompt, unnamed } from "./fixtures";

describe("Cursor hook → FocusDeck event", () => {
  it.each([
    { hook: "stop", input: stop, kind: "agent-finished" },
    { hook: "beforeSubmitPrompt", input: prompt, kind: "agent-resumed" },
  ])("maps $hook to $kind, for the cursor-agent app", ({ input, kind }) => {
    expect(toSensorEvent(input)).toEqual({ kind, app: APP, source: SOURCE, via: VIA });
    expect([APP, VIA]).toEqual(["cursor-agent", "cursor"]);
  });

  it.each([...FINISHED_STATUSES, undefined])("counts a stop with status %s as the agent finishing", (status) => {
    expect(toSensorEvent({ ...stop, status })?.kind).toBe("agent-finished");
  });

  it.each(["aborted", "from_the_future", "", null, 0])("drops a stop with status %j: you stopped it, or it isn't a known ending", (status) => {
    expect(toSensorEvent({ ...stop, status })).toBeNull();
  });

  it.each([
    "beforeShellExecution", "afterShellExecution", "beforeMCPExecution", "afterMCPExecution", "beforeReadFile", "afterFileEdit",
    "afterAgentResponse", "afterAgentThought", "preToolUse", "postToolUse", "postToolUseFailure", "subagentStart", "subagentStop",
    "sessionStart", "sessionEnd", "preCompact", "beforeTabFileRead", "afterTabFileEdit", "Stop", "UserPromptSubmit", "", "__proto__", "toString", null,
  ])("returns null for hook event %s", (hook) => {
    expect(toSensorEvent({ ...common, hook_event_name: hook })).toBeNull();
    expect(toSensorEvent({ ...common, hook_event_name: hook }, "stop")).toBeNull(); // the input's own name wins
  });

  it("falls back to the hook name from the command line only when the input doesn't name its event", () => {
    expect(toSensorEvent(unnamed(stop), "stop")).toEqual({ kind: "agent-finished", app: APP, source: SOURCE, via: VIA });
    expect(toSensorEvent(unnamed(prompt), "beforeSubmitPrompt")).toEqual({ kind: "agent-resumed", app: APP, source: SOURCE, via: VIA });
    expect(toSensorEvent(unnamed(stop))).toBeNull();
    expect(toSensorEvent(unnamed(stop), "afterShellExecution")).toBeNull();
    expect(toSensorEvent(unnamed(stop), "__proto__")).toBeNull();
  });

  it.each([[null], [undefined], ["stop"], [42], [true], [[]], [[stop]]])("returns null for non-object input %j", (input) => {
    expect(toSensorEvent(input, "stop")).toBeNull();
  });
});

describe("Class E: content never leaves the mapping", () => {
  const needles = [SECRET, CONVERSATION, "acme-payroll", "dev@", ".env", "/Users", "composer", "2.4.21", "password", "transcripts", "7f2e9c41"];

  it.each([stop, prompt])("emits only kind, app, source and via for $hook_event_name", (input) => {
    const event = toSensorEvent(input);
    expect(Object.keys(event ?? {}).sort()).toEqual(["app", "kind", "source", "via"]);
    const wire = JSON.stringify(event);
    for (const needle of needles) expect(wire).not.toContain(needle);
  });

  it("builds the event from constants, so input fields named like event fields cannot ride along", () => {
    const sneaky = { ...prompt, kind: "app-switch", app: "slack", source: "alice@example.com", via: "evil", at: 0, url: "https://x.com", title: SECRET };
    expect(toSensorEvent(sneaky)).toEqual({ kind: "agent-resumed", app: "cursor-agent", source: SOURCE, via: "cursor" });
  });

  it.each([stop, prompt])("passes the bridge's intake contract for $hook_event_name", (input) => {
    expect(meetsContract(toSensorEvent(input))).toBe(true);
    if (intake) expect(intake.parseSensorEvent(toSensorEvent(input), Date.now())).toMatchObject({ ok: true, event: { via: "cursor" } });
  });
});

describe("conversation hashing: stable and opaque", () => {
  it("is the first 16 hex chars of sha256(conversation_id), and a valid opaque source", () => {
    expect(SOURCE).toBe(createHash("sha256").update(CONVERSATION).digest("hex").slice(0, 16));
    expect(SOURCE).toMatch(/^[0-9a-f]{16}$/);
    expect(SOURCE).toMatch(CONTRACT.source);
  });

  it("is stable per conversation, ignores the per-turn generation_id, and reveals nothing of the id", () => {
    expect(toSensorEvent(stop)?.source).toBe(toSensorEvent({ ...prompt, generation_id: "another-turn" })?.source);
    expect(hashConversation("11111111-2222-3333-4444-555555555555")).not.toBe(SOURCE);
    expect(SOURCE).not.toBe(CONVERSATION.replace(/-/g, "").slice(0, 16));
    expect(CONVERSATION).not.toContain(SOURCE);
  });

  it.each([undefined, "", 12345, null])("omits source when conversation_id is %s", (conversationId) => {
    expect(toSensorEvent({ ...stop, conversation_id: conversationId })).toEqual({ kind: "agent-finished", app: "cursor-agent", via: "cursor" });
  });
});
