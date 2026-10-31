import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SOURCE_PATTERN, parseSensorEvent } from "../../src/lib/bridge/intake";
import { APP, NEEDS_INPUT_NOTIFICATIONS, hashSession, toSensorEvent } from "./mapping.mjs";

const HOOK = fileURLToPath(new URL("./focusdeck-hook.mjs", import.meta.url));
const SESSION = "00893aaf-19fa-41d2-8238-13269b9b3ca0";
const SECRET = "hunter2-AKIA-DO-NOT-LEAK";
const SOURCE = hashSession(SESSION);

// Input shapes from code.claude.com/docs/en/hooks, salted with content that must never leave.
const common = {
  session_id: SESSION,
  transcript_path: `/Users/dev/.claude/projects/acme-payroll/${SESSION}.jsonl`,
  cwd: "/Users/dev/acme-payroll",
  permission_mode: "default",
};
const notification = {
  ...common,
  hook_event_name: "Notification",
  message: `Claude needs your permission to use Bash: curl -u admin:${SECRET}`,
  title: "Permission needed",
  notification_type: "permission_prompt",
};
const stop = {
  ...common,
  hook_event_name: "Stop",
  stop_hook_active: false,
  last_assistant_message: `Rotated the database password to ${SECRET}.`,
  background_tasks: [{ id: "task-001", type: "shell", status: "running", description: "tail logs", command: `grep ${SECRET} /var/log/app.log` }],
  session_crons: [{ id: "cron-001", schedule: "0 9 * * 1-5", recurring: true, prompt: `email ${SECRET} to finance` }],
};
const prompt = { ...common, hook_event_name: "UserPromptSubmit", prompt: `My password is ${SECRET}, fix the login bug`, session_title: "payroll" };

describe("Claude Code hook → FocusDeck event", () => {
  it.each([
    { hook: "Notification", input: notification, kind: "agent-needs-input" },
    { hook: "Stop", input: stop, kind: "agent-finished" },
    { hook: "UserPromptSubmit", input: prompt, kind: "agent-resumed" },
  ])("maps $hook to $kind", ({ input, kind }) => {
    expect(toSensorEvent(input)).toEqual({ kind, app: APP, source: SOURCE });
    expect(APP).toBe("claude-code");
  });

  it.each([...NEEDS_INPUT_NOTIFICATIONS, undefined])("treats a %s notification as the session being blocked on you", (type) => {
    expect(toSensorEvent({ ...notification, notification_type: type })?.kind).toBe("agent-needs-input");
  });

  it.each(["idle_prompt", "auth_success", "elicitation_complete", "elicitation_response", "agent_needs_input", "agent_completed", "quota_auto_resume_fired", "plugin_notification", "from_the_future", null])(
    "drops a %s notification: it does not mean this session is blocked on you",
    (type) => expect(toSensorEvent({ ...notification, notification_type: type })).toBeNull(),
  );

  it.each(["PreToolUse", "PostToolUse", "SubagentStop", "StopFailure", "SessionStart", "SessionEnd", "PreCompact", "", "__proto__", "toString", undefined])(
    "returns null for hook event %s",
    (hook) => expect(toSensorEvent({ ...common, hook_event_name: hook })).toBeNull(),
  );

  it.each([[null], [undefined], ["Stop"], [42], [true], [[]], [[stop]]])("returns null for non-object input %j", (input) => {
    expect(toSensorEvent(input)).toBeNull();
  });
});

describe("Class E: content never leaves the mapping", () => {
  const needles = [SECRET, SESSION, "acme-payroll", ".jsonl", "/Users", "permission", "password", "Rotated", "tail logs", "0 9 * * 1-5", "payroll"];

  it.each([notification, stop, prompt])("emits only kind, app and source for $hook_event_name", (input) => {
    const event = toSensorEvent(input);
    expect(Object.keys(event ?? {}).sort()).toEqual(["app", "kind", "source"]);
    const wire = JSON.stringify(event);
    for (const needle of needles) expect(wire).not.toContain(needle);
  });

  it("builds the event from constants, so input fields named like event fields cannot ride along", () => {
    const sneaky = { ...prompt, kind: "app-switch", app: "slack", source: "alice@example.com", at: 0, url: "https://x.com", title: SECRET };
    expect(toSensorEvent(sneaky)).toEqual({ kind: "agent-resumed", app: "claude-code", source: SOURCE });
  });

  it.each([notification, stop, prompt])("passes the bridge's own intake contract for $hook_event_name", (input) => {
    expect(parseSensorEvent(toSensorEvent(input), Date.now()).ok).toBe(true);
  });
});

describe("session hashing: stable and opaque", () => {
  it("is the first 16 hex chars of sha256(session_id), and a valid opaque source", () => {
    expect(SOURCE).toBe(createHash("sha256").update(SESSION).digest("hex").slice(0, 16));
    expect(SOURCE).toMatch(/^[0-9a-f]{16}$/);
    expect(SOURCE).toMatch(SOURCE_PATTERN);
  });

  it("is stable per session, distinct across sessions, and reveals nothing of the id", () => {
    expect(toSensorEvent(stop)?.source).toBe(toSensorEvent(prompt)?.source);
    expect(hashSession("11111111-2222-3333-4444-555555555555")).not.toBe(SOURCE);
    expect(SOURCE).not.toBe(SESSION.replace(/-/g, "").slice(0, 16));
    expect(SESSION).not.toContain(SOURCE);
  });

  it.each([undefined, "", 12345, null])("omits source when session_id is %s", (sessionId) => {
    expect(toSensorEvent({ ...stop, session_id: sessionId })).toEqual({ kind: "agent-finished", app: "claude-code" });
  });
});

interface Received {
  method?: string;
  url?: string;
  headers: IncomingHttpHeaders;
  body: string;
}

/** A stand-in bridge on a free loopback port that records what the hook sends. */
function fakeBridge({ answer = true } = {}) {
  const received: Received[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      received.push({ method: req.method, url: req.url, headers: req.headers, body });
      if (answer) res.writeHead(200, { "content-type": "application/json" }).end('{"accepted":1}');
    });
  });
  return new Promise<{ url: string; received: Received[]; close: () => Promise<void> }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      const close = () => new Promise<void>((done) => { server.closeAllConnections(); server.close(() => done()); });
      resolve({ url: `http://127.0.0.1:${port}`, received, close });
    });
  });
}

/**
 * Runs the hook as Claude Code would: JSON on stdin. The environment is clean so
 * FOCUSDECK_* or NODE_OPTIONS from your shell can't leak in (NODE_ENV is only
 * there because Next's ProcessEnv type requires it).
 */
function runHook(stdin: string, env: Record<string, string> = {}) {
  return new Promise<{ code: number | null; stdout: string; stderr: string; ms: number }>((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [HOOK], { env: { PATH: process.env.PATH ?? "", NODE_ENV: "test", ...env } });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    child.stdin.on("error", () => {});
    child.on("close", (code) => resolve({ code, stdout, stderr, ms: Date.now() - started }));
    child.stdin.end(stdin);
  });
}

describe("focusdeck-hook.mjs end to end", { timeout: 15_000 }, () => {
  it("POSTs exactly the mapped event as JSON, with the bearer token, and prints nothing", async () => {
    const bridge = await fakeBridge();
    const run = await runHook(JSON.stringify(prompt), { FOCUSDECK_URL: `${bridge.url}/`, FOCUSDECK_SENSOR_TOKEN: "t0ken" });
    await bridge.close();
    expect(run).toMatchObject({ code: 0, stdout: "", stderr: "" });
    expect(bridge.received).toHaveLength(1);
    const [request] = bridge.received;
    expect(request).toMatchObject({ method: "POST", url: "/api/sensor/events" });
    expect(request.headers["content-type"]).toContain("application/json");
    expect(request.headers.authorization).toBe("Bearer t0ken");
    expect(JSON.parse(request.body)).toEqual({ kind: "agent-resumed", app: "claude-code", source: SOURCE });
    for (const needle of [SECRET, SESSION, "payroll"]) expect(request.body).not.toContain(needle);
  });

  it("sends no Authorization header when no token is set", async () => {
    const bridge = await fakeBridge();
    const run = await runHook(JSON.stringify(notification), { FOCUSDECK_URL: bridge.url });
    await bridge.close();
    expect(run.code).toBe(0);
    expect(bridge.received[0].headers.authorization).toBeUndefined();
  });

  it("exits 0, silently, when the bridge is down", async () => {
    const bridge = await fakeBridge();
    await bridge.close(); // the port is now closed
    const run = await runHook(JSON.stringify(stop), { FOCUSDECK_URL: bridge.url });
    expect(run).toMatchObject({ code: 0, stdout: "", stderr: "" });
  });

  it("gives up after ~1.5 s on a bridge that never answers", async () => {
    const bridge = await fakeBridge({ answer: false });
    const run = await runHook(JSON.stringify(stop), { FOCUSDECK_URL: bridge.url });
    await bridge.close();
    expect(run).toMatchObject({ code: 0, stdout: "", stderr: "" });
    expect(bridge.received).toHaveLength(1);
    expect(run.ms).toBeGreaterThanOrEqual(1400);
    expect(run.ms).toBeLessThan(3500); // the AbortController fired, not the 4 s backstop
  });

  it("exits 0 and sends nothing on bad input or unmapped events", async () => {
    const bridge = await fakeBridge();
    const inputs = ["", "not json", "{", "null", "[]", '"Stop"', JSON.stringify({ ...common, hook_event_name: "PreToolUse", tool_input: { command: SECRET } })];
    const runs = await Promise.all(inputs.map((stdin) => runHook(stdin, { FOCUSDECK_URL: bridge.url })));
    await bridge.close();
    for (const run of runs) expect(run).toMatchObject({ code: 0, stdout: "", stderr: "" });
    expect(bridge.received).toHaveLength(0);
  });

  it("with FOCUSDECK_DEBUG=1 explains itself on stderr, still never on stdout, and never echoes content", async () => {
    const bridge = await fakeBridge();
    const run = await runHook(JSON.stringify(prompt), { FOCUSDECK_URL: bridge.url, FOCUSDECK_DEBUG: "1" });
    await bridge.close();
    expect(run).toMatchObject({ code: 0, stdout: "" });
    expect(run.stderr).toContain("focusdeck-hook: sent");
    expect(run.stderr).not.toContain(SECRET);
  });
});
