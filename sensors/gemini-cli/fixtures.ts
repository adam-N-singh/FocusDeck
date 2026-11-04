/** Shared fixtures and helpers for this connector's tests. Not a test file itself. */
import { spawn } from "node:child_process";
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { hashSession } from "./mapping.mjs";

export const HOOK = fileURLToPath(new URL("./focusdeck-hook.mjs", import.meta.url));
export const REPO = fileURLToPath(new URL("../..", import.meta.url));
export const SESSION = "3f1c9a52-6b0e-4d7a-8c21-9e4b5a7d0f16";
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

// Input shapes from docs/hooks/reference.md in google-gemini/gemini-cli, salted with content that must never leave.
export const common = {
  session_id: SESSION,
  transcript_path: `/Users/dev/.gemini/tmp/acme-payroll/chats/session-2026-11-03T09-12-${SESSION.slice(0, 8)}.json`,
  cwd: "/Users/dev/acme-payroll",
  timestamp: "2026-11-03T09:12:44.123Z",
};

export const notification = {
  ...common,
  hook_event_name: "Notification",
  notification_type: "ToolPermission",
  message: `Tool run_shell_command requires confirmation: curl -u admin:${SECRET}`,
  details: { type: "exec", title: "Confirm Shell Command", command: `curl -u admin:${SECRET} https://payroll.internal`, rootCommand: "curl" },
};

export const afterAgent = {
  ...common,
  hook_event_name: "AfterAgent",
  prompt: `My password is ${SECRET}, fix the login bug`,
  prompt_response: `Rotated the database password to ${SECRET}.`,
  stop_hook_active: false,
};

export const beforeAgent = { ...common, hook_event_name: "BeforeAgent", prompt: `My password is ${SECRET}, fix the login bug` };

export interface Received {
  method?: string;
  url?: string;
  headers: IncomingHttpHeaders;
  body: string;
}

/** A stand-in bridge on a free loopback port that records what the hook sends. */
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
 * Runs the hook as Gemini CLI would: JSON on stdin. `stdin: null` leaves stdin
 * open, like a host that never closes it. The environment is clean so
 * FOCUSDECK_* or NODE_OPTIONS from your shell can't leak in (NODE_ENV is only
 * there because Next's ProcessEnv type requires it).
 */
export function runHook(stdin: string | null, env: Record<string, string> = {}) {
  return new Promise<{ code: number | null; stdout: string; stderr: string; ms: number }>((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [HOOK], { env: { PATH: process.env.PATH ?? "", NODE_ENV: "test", ...env } });
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
