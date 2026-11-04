/** Shared fixtures and helpers for this connector's tests. Not a test file itself. */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const POLLER = fileURLToPath(new URL("./focusdeck-github.mjs", import.meta.url));
export const REPO = fileURLToPath(new URL("../..", import.meta.url));
export const SECRET = "hunter2-AKIA-DO-NOT-LEAK";
export const LAST_MODIFIED = "Tue, 03 Nov 2026 09:12:44 GMT";

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

// Thread shape from the REST API description for GET /notifications, salted with content that must never leave.
export const repository = {
  id: 1296269,
  node_id: "MDEwOlJlcG9zaXRvcnkxMjk2MjY5",
  name: "acme-payroll",
  full_name: "acme-corp/acme-payroll",
  owner: { login: "acme-corp", id: 583231, type: "Organization", html_url: "https://github.com/acme-corp" },
  private: true,
  html_url: "https://github.com/acme-corp/acme-payroll",
  description: `Payroll, and the ${SECRET} vault`,
  url: "https://api.github.com/repos/acme-corp/acme-payroll",
};

export function thread(id: string, reason: string | undefined, type: string, updatedAt = "2026-11-03T09:12:44Z") {
  return {
    id,
    unread: true,
    reason,
    updated_at: updatedAt,
    last_read_at: null,
    subject: {
      title: `Rotate ${SECRET} before Friday`,
      url: "https://api.github.com/repos/acme-corp/acme-payroll/pulls/1347",
      latest_comment_url: "https://api.github.com/repos/acme-corp/acme-payroll/issues/comments/990417",
      type,
    },
    repository,
    url: `https://api.github.com/notifications/threads/${id}`,
    subscription_url: `https://api.github.com/notifications/threads/${id}/subscription`,
  };
}

export const review = thread("17964567185", "review_requested", "PullRequest");
export const ci = thread("17964567186", "ci_activity", "CheckSuite");
export const mention = thread("17964567187", "mention", "Issue");

/** What `gh api --include` prints: Go's Println of the status line, sorted "Name: value\r\n" headers, "\r\n", then the body. */
export function ghOutput(status: number, body = "", headers: Record<string, string> = {}) {
  const statusText: Record<number, string> = { 200: "OK", 304: "Not Modified", 401: "Unauthorized" };
  const all: Record<string, string> = { "Content-Type": "application/json; charset=utf-8", "X-Poll-Interval": "60", ...headers };
  const lines = Object.keys(all).sort().map((name) => `${name}: ${all[name]}\r\n`).join("");
  return `HTTP/2.0 ${status} ${statusText[status] ?? ""}\n${lines}\r\n${body}`;
}

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

/** A stub `gh`: logs its arguments and the environment the poller gave it, then prints a canned response. */
export const STUB_GH = `#!/usr/bin/env node
const fs = require("node:fs");
fs.appendFileSync(process.env.GH_STUB_LOG, JSON.stringify({ args: process.argv.slice(2), prompt: process.env.GH_PROMPT_DISABLED ?? null, token: process.env.FOCUSDECK_SENSOR_TOKEN ?? null }) + "\\n");
process.stdout.write(fs.existsSync(process.env.GH_STUB_RESPONSE) ? fs.readFileSync(process.env.GH_STUB_RESPONSE, "utf8") : "");
if (process.env.GH_STUB_STDERR) process.stderr.write(process.env.GH_STUB_STDERR);
process.exitCode = Number(process.env.GH_STUB_EXIT || 0);
`;

export const sandboxes: string[] = [];

/** A private TMPDIR (for the state file) and a PATH whose `gh` is the stub. */
export function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "focusdeck-github-test-"));
  sandboxes.push(dir);
  const bin = join(dir, "bin");
  const tmp = join(dir, "tmp");
  mkdirSync(bin);
  mkdirSync(tmp);
  writeFileSync(join(bin, "gh"), STUB_GH, { mode: 0o755 });
  const log = join(dir, "gh-calls.jsonl");
  const response = join(dir, "gh-response.txt");
  return {
    dir,
    stateFile: join(tmp, `focusdeck-github-${process.getuid?.() ?? "user"}.json`),
    respond: (output: string) => writeFileSync(response, output),
    calls: (): { args: string[]; prompt: string | null; token: string | null }[] =>
      existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").map((line) => JSON.parse(line)) : [],
    env: (extra: Record<string, string> = {}): NodeJS.ProcessEnv => ({
      PATH: [bin, dirname(process.execPath), process.env.PATH ?? ""].join(delimiter),
      NODE_ENV: "test", // only because Next's ProcessEnv type requires it
      TMPDIR: tmp,
      GH_STUB_LOG: log,
      GH_STUB_RESPONSE: response,
      ...extra,
    }),
  };
}

/** Runs the poller with a clean environment, so FOCUSDECK_* or NODE_OPTIONS from your shell can't leak in. */
export function runPoller(args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<{ code: number | null; stdout: string; stderr: string; ms: number }>((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [POLLER, ...args], { env });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) => resolve({ code, stdout, stderr, ms: Date.now() - started }));
  });
}

export const quiet = { code: 0, stdout: "", stderr: "" };
export const list = (...threads: unknown[]) => ghOutput(200, JSON.stringify(threads), { "Last-Modified": LAST_MODIFIED });

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
