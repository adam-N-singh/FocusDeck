/** Shared fixtures and helpers for this connector's tests. Not a test file itself. */
import { spawn } from "node:child_process";
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { hashSession } from "./mapping.mjs";

export const HOOK = fileURLToPath(new URL("./focusdeck-hook.mjs", import.meta.url));
export const REPO = fileURLToPath(new URL("../..", import.meta.url));
export const SESSION = "019a4f2e-7d1b-7c3a-9e55-4b8d2c6f1a03"; // Codex thread ids are UUIDv7
export const SECRET = "hunter2-AKIA-DO-NOT-LEAK";
export const SOURCE = hashSession(SESSION);

/**
 * The bridge's intake contract, with the `via` field and new app ids landing
 * alongside these sensors. Mirrored here rather than imported, because src/ is
 * changing at the same time.
 */
export const CONTRACT = {
  fields: ["kind", "app", "source", "at", "via"],
  kinds: ["app-switch", "notification", "agent-needs-input", "agent-finished", "agent-resumed"],
  source: /^[A-Za-z0-9_-]{1,64}$/,
  id: /^[a-z0-9][a-z0-9-]{0,39}$/,
};

export function meetsContract(event: unknown): boolean {
  if (typeof event !== "object" || event === null) return false;
  const e = event as Record<string, unknown>;
  return (
    Object.keys(e).every((field) => CONTRACT.fields.includes(field)) &&
    CONTRACT.kinds.includes(e.kind as string) &&
    typeof e.app === "string" && CONTRACT.id.test(e.app) &&
    typeof e.via === "string" && CONTRACT.id.test(e.via) &&
    (e.source === undefined || (typeof e.source === "string" && CONTRACT.source.test(e.source)))
  );
}

/** The bridge's own intake as well, whenever src/ loads; the mirror above must hold either way. */
export const intake = await import("../../src/lib/bridge/intake").catch(() => null);

// Hook input shapes from codex-rs/hooks/schema/generated (rust-v0.166.0), salted with content that must never leave.
export const common = {
  session_id: SESSION,
  turn_id: "019a4f2f-0c6e-7a11-8c2d-55aa66bb77cc",
  transcript_path: `/Users/dev/.codex/sessions/2026/11/03/rollout-2026-11-03T09-12-44-${SESSION}.jsonl`,
  cwd: "/Users/dev/acme-payroll",
  model: "gpt-5-codex",
  permission_mode: "default",
};

export const permission = {
  ...common,
  hook_event_name: "PermissionRequest",
  tool_name: "Bash",
  tool_input: { command: `curl -u admin:${SECRET} https://payroll.internal/api`, description: "Check the payroll API" },
};

export const stop = { ...common, hook_event_name: "Stop", stop_hook_active: false, last_assistant_message: `Rotated the database password to ${SECRET}.` };
export const prompt = { ...common, hook_event_name: "UserPromptSubmit", prompt: `My password is ${SECRET}, fix the login bug` };

// The legacy notify payload, from codex-rs/hooks/src/legacy_notify.rs.
export const notify = {
  type: "agent-turn-complete",
  "thread-id": SESSION,
  "turn-id": "12345",
  cwd: "/Users/dev/acme-payroll",
  client: "codex-tui",
  "input-messages": [`My password is ${SECRET}, fix the login bug`],
  "last-assistant-message": `Rotated the database password to ${SECRET}.`,
};

export interface Received {
  method?: string;
  url?: string;
  headers: IncomingHttpHeaders;
  body: string;
}

/** A stand-in bridge on a free loopback port that records what the sensor sends. */
export function fakeBridge({ answer = true } = {}) {
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
 * Runs the sensor as Codex would: hook input on stdin, or the notify JSON as the
 * last argument. `stdin: null` leaves stdin open, like a host that never closes
 * it. The environment is clean so FOCUSDECK_* or NODE_OPTIONS from your shell
 * can't leak in (NODE_ENV is only there because Next's ProcessEnv type requires it).
 */
export function runSensor({ stdin = "", args = [] as string[], env = {} as Record<string, string> }: { stdin?: string | null; args?: string[]; env?: Record<string, string> }) {
  return new Promise<{ code: number | null; stdout: string; stderr: string; ms: number }>((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [HOOK, ...args], { env: { PATH: process.env.PATH ?? "", NODE_ENV: "test", ...env } });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    child.stdin.on("error", () => {});
    child.on("close", (code) => resolve({ code, stdout, stderr, ms: Date.now() - started }));
    if (stdin !== null) child.stdin.end(stdin);
  });
}

export interface Manifest {
  id: string;
  category: string;
  status: string;
  platforms: string[];
  emits: { kind: string; app: string; when: string }[];
  apps?: { id: string; label: string; group: string }[];
  privacy: { sends: string[]; neverSends: string[] };
  requirements: string[];
  setup: { title: string; body?: string; code?: { language: string; content: string } }[];
  test: { command: string; expect: string };
  docs: string;
}
