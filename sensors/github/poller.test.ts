import { spawn } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP, VIA, hashThread, isHttpDate, parseGhResponse, seenKey } from "./mapping.mjs";
import { POLLER, REPO, SECRET, LAST_MODIFIED, thread, review, ci, mention, ghOutput, fakeBridge, sandbox, runPoller, quiet, list, type Manifest } from "./fixtures";

describe("parseGhResponse: reading `gh api --include`", () => {
  it("splits status, the headers the poller obeys, and the body", () => {
    const body = JSON.stringify([review]);
    expect(parseGhResponse(ghOutput(200, body, { "Last-Modified": LAST_MODIFIED, "X-Poll-Interval": "120" }))).toEqual({ status: 200, pollInterval: 120, lastModified: LAST_MODIFIED, body });
  });

  it("reads header names in any case, and a 304 with no body", () => {
    expect(parseGhResponse(`HTTP/1.1 304 Not Modified\r\nx-poll-interval: 60\r\nLAST-MODIFIED: ${LAST_MODIFIED}\r\n\r\n`)).toEqual({ status: 304, pollInterval: 60, lastModified: LAST_MODIFIED, body: "" });
    expect(parseGhResponse("HTTP/2.0 200 OK\n\r\n[]")).toEqual({ status: 200, body: "[]" });
  });

  it("ignores header values it must not pass back to GitHub", () => {
    const response = parseGhResponse(ghOutput(200, "[]", { "Last-Modified": "yesterday; rm -rf /", "X-Poll-Interval": "-5" }));
    expect(response).toEqual({ status: 200, body: "[]" });
    expect(isHttpDate(LAST_MODIFIED)).toBe(true);
    for (const value of ["", "Tue, 3 Nov 2026 09:12:44 GMT", `${LAST_MODIFIED}\n`, 42, undefined]) expect(isHttpDate(value)).toBe(false);
  });

  it.each(["", "gh: To get started with GitHub CLI, please run:  gh auth login", "[]", '{"message":"Bad credentials"}', "HTTP/2.0 abc OK\n"])(
    "returns null when stdout holds no HTTP response: %j",
    (stdout) => expect(parseGhResponse(stdout)).toBeNull(),
  );
});

describe("focusdeck-github.mjs end to end, against a stub gh", { timeout: 20_000 }, () => {
  it("remembers the backlog on its first run, then sends each new notification once, batched, with the token", async () => {
    const box = sandbox();
    const bridge = await fakeBridge();
    const env = box.env({ FOCUSDECK_URL: `${bridge.url}/`, FOCUSDECK_SENSOR_TOKEN: "t0ken" });

    box.respond(list(review, ci, mention));
    expect(await runPoller(["--once"], env)).toMatchObject(quiet);
    expect(bridge.received).toHaveLength(0); // the backlog is not news

    const newReview = thread("17964567190", "review_requested", "PullRequest", "2026-11-03T10:01:00Z");
    const newCi = thread("17964567191", "ci_activity", "CheckSuite", "2026-11-03T10:02:00Z");
    box.respond(list(newReview, review, ci, mention, newCi));
    expect(await runPoller(["--once"], env)).toMatchObject(quiet);
    expect(bridge.received).toHaveLength(1);
    const [request] = bridge.received;
    expect(request).toMatchObject({ method: "POST", url: "/api/sensor/events" });
    expect(request.headers["content-type"]).toContain("application/json");
    expect(request.headers.authorization).toBe("Bearer t0ken");
    expect(JSON.parse(request.body)).toEqual([
      { kind: "agent-needs-input", app: "github", source: hashThread("17964567190"), via: "github" },
      { kind: "agent-finished", app: "github", source: hashThread("17964567191"), via: "github" },
    ]);
    for (const needle of [SECRET, "acme", "github.com", "1796456719", "Rotate"]) expect(request.body).not.toContain(needle);

    expect(await runPoller(["--once"], env)).toMatchObject(quiet);
    expect(bridge.received).toHaveLength(1); // nothing is reported twice

    box.respond(list(thread("17964567187", "mention", "Issue", "2026-11-03T11:00:00Z")));
    expect(await runPoller(["--once"], env)).toMatchObject(quiet);
    expect(bridge.received.slice(1).map((r) => JSON.parse(r.body))).toEqual([{ kind: "notification", app: "github", source: hashThread("17964567187"), via: "github" }]);
    await bridge.close();

    // gh ran with an argument array, prompts off, without FocusDeck's token, and asked If-Modified-Since once it knew.
    const calls = box.calls();
    expect(calls[0]).toEqual({ args: ["api", "--include", "notifications"], prompt: "1", token: null });
    for (const call of calls.slice(1)) expect(call.args).toEqual(["api", "--include", "notifications", "--header", `If-Modified-Since: ${LAST_MODIFIED}`]);
  });

  it("keeps a private state file of hashes only", async () => {
    const box = sandbox();
    box.respond(list(review, ci, mention));
    expect(await runPoller(["--once"], box.env({ FOCUSDECK_URL: "http://127.0.0.1:9" }))).toMatchObject(quiet);
    const raw = readFileSync(box.stateFile, "utf8");
    expect(JSON.parse(raw)).toEqual({ version: 1, lastModified: LAST_MODIFIED, seen: [seenKey(review), seenKey(ci), seenKey(mention)] });
    for (const needle of [SECRET, "acme", "github.com", "17964567185", "Rotate"]) expect(raw).not.toContain(needle);
    if (process.platform !== "win32") expect(statSync(box.stateFile).mode & 0o777).toBe(0o600);
  });

  it("neither follows nor trusts a symlink planted at the state path", async () => {
    const box = sandbox();
    const victim = join(box.dir, "victim.txt");
    writeFileSync(victim, "untouched");
    mkdirSync(dirname(box.stateFile), { recursive: true });
    symlinkSync(victim, box.stateFile);
    const bridge = await fakeBridge();
    box.respond(list(review));
    expect(await runPoller(["--once"], box.env({ FOCUSDECK_URL: bridge.url }))).toMatchObject(quiet);
    await bridge.close();
    expect(bridge.received).toHaveLength(0); // an untrusted state means a first run
    expect(readFileSync(victim, "utf8")).toBe("untouched");
    expect(lstatSync(box.stateFile).isSymbolicLink()).toBe(false);
  });

  it("splits more than 100 new notifications into batches the bridge accepts", async () => {
    const box = sandbox();
    const bridge = await fakeBridge();
    const env = box.env({ FOCUSDECK_URL: bridge.url });
    box.respond(list(mention));
    await runPoller(["--once"], env);
    box.respond(list(...Array.from({ length: 150 }, (_, i) => thread(String(20000000000 + i), "subscribed", "Issue"))));
    expect(await runPoller(["--once"], env)).toMatchObject(quiet);
    await bridge.close();
    expect(bridge.received.map((r) => JSON.parse(r.body).length)).toEqual([100, 50]);
  });

  it.each([
    { name: "a 304", output: ghOutput(304), exit: "1" },
    { name: "a 401", output: ghOutput(401, '{"message":"Bad credentials"}'), exit: "1" },
    { name: "gh failing before any request", output: "", exit: "4" },
    { name: "a body that isn't JSON", output: ghOutput(200, "<html>"), exit: "0" },
    { name: "a body that isn't a list", output: ghOutput(200, '{"message":"x"}'), exit: "0" },
  ])("sends nothing, silently, on $name", async ({ output, exit }) => {
    const box = sandbox();
    const bridge = await fakeBridge();
    box.respond(list(mention));
    await runPoller(["--once"], box.env({ FOCUSDECK_URL: bridge.url }));
    box.respond(output);
    const run = await runPoller(["--once"], box.env({ FOCUSDECK_URL: bridge.url, GH_STUB_EXIT: exit, GH_STUB_STDERR: `gh: ${SECRET}\n` }));
    await bridge.close();
    expect(run).toMatchObject(quiet);
    expect(bridge.received).toHaveLength(0);
  });

  it("exits 0, silently, when gh isn't installed", async () => {
    const box = sandbox();
    const empty = join(box.dir, "empty");
    mkdirSync(empty);
    const run = await runPoller(["--once"], { ...box.env({ FOCUSDECK_URL: "http://127.0.0.1:9" }), PATH: empty });
    expect(run).toMatchObject(quiet);
    expect(box.calls()).toHaveLength(0);
  });

  it("exits 0, silently, when the bridge is down, and does not queue what it couldn't send", async () => {
    const box = sandbox();
    const bridge = await fakeBridge();
    await bridge.close(); // the port is now closed
    box.respond(list(mention));
    await runPoller(["--once"], box.env({ FOCUSDECK_URL: bridge.url }));
    box.respond(list(review, mention));
    expect(await runPoller(["--once"], box.env({ FOCUSDECK_URL: bridge.url }))).toMatchObject(quiet);

    const later = await fakeBridge();
    expect(await runPoller(["--once"], box.env({ FOCUSDECK_URL: later.url }))).toMatchObject(quiet);
    await later.close();
    expect(later.received).toHaveLength(0);
  });

  it("with FOCUSDECK_INTERNAL=1 sends nothing, never runs gh, and exits at once", async () => {
    const box = sandbox();
    const bridge = await fakeBridge();
    box.respond(list(review));
    const runs = await Promise.all([[], ["--once"], ["--test"]].map((args) => runPoller(args, box.env({ FOCUSDECK_URL: bridge.url, FOCUSDECK_INTERNAL: "1", FOCUSDECK_DEBUG: "1" }))));
    await bridge.close();
    for (const run of runs) {
      expect(run).toMatchObject(quiet);
      expect(run.ms).toBeLessThan(1500);
    }
    expect(box.calls()).toHaveLength(0);
    expect(bridge.received).toHaveLength(0);
    expect(existsSync(box.stateFile)).toBe(false);
  });

  it("--test sends one sample event without calling gh", async () => {
    const box = sandbox();
    const bridge = await fakeBridge();
    const run = await runPoller(["--test"], box.env({ FOCUSDECK_URL: bridge.url }));
    await bridge.close();
    expect(run).toMatchObject(quiet);
    expect(box.calls()).toHaveLength(0);
    expect(bridge.received.map((r) => JSON.parse(r.body))).toEqual([{ kind: "notification", app: "github", source: hashThread("focusdeck-test"), via: "github" }]);
  });

  it("polls until stopped, and exits 0 on SIGTERM", async () => {
    const box = sandbox();
    const bridge = await fakeBridge();
    const env = box.env({ FOCUSDECK_URL: bridge.url });
    box.respond(list(mention));
    await runPoller(["--once"], env);
    box.respond(list(review, mention));
    const child = spawn(process.execPath, [POLLER], { env });
    let stdout = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => child.on("close", (code, signal) => resolve({ code, signal })));
    for (let waited = 0; bridge.received.length === 0 && waited < 10_000; waited += 50) await new Promise((r) => setTimeout(r, 50));
    child.kill("SIGTERM");
    expect(await exited).toEqual({ code: 0, signal: null });
    await bridge.close();
    expect(stdout).toBe("");
    expect(bridge.received.map((r) => JSON.parse(r.body))).toEqual([{ kind: "agent-needs-input", app: "github", source: hashThread("17964567185"), via: "github" }]);
  });

  it("with FOCUSDECK_DEBUG=1 explains itself on stderr, still never on stdout, and never echoes content", async () => {
    const box = sandbox();
    const bridge = await fakeBridge();
    const env = box.env({ FOCUSDECK_URL: bridge.url, FOCUSDECK_DEBUG: "1", GH_STUB_STDERR: `gh: ${SECRET}\n` });
    box.respond(list(mention));
    const first = await runPoller(["--once"], env);
    box.respond(list(review, mention));
    const second = await runPoller(["--once"], env);
    box.respond("");
    const third = await runPoller(["--once"], { ...env, GH_STUB_EXIT: "1" });
    await bridge.close();
    expect(first.stderr).toContain("focusdeck-github: first run: remembered 1 notification(s), sent nothing");
    expect(second.stderr).toContain("focusdeck-github: sent");
    expect(third.stderr).toContain("focusdeck-github: gh gave no HTTP response");
    for (const run of [first, second, third]) {
      expect(run).toMatchObject({ code: 0, stdout: "" });
      for (const needle of [SECRET, "acme", "github.com", "17964567185", "Rotate"]) expect(run.stderr).not.toContain(needle);
    }
  });
});

describe("manifest.json", { timeout: 15_000 }, () => {
  const manifest = JSON.parse(readFileSync(new URL("./manifest.json", import.meta.url), "utf8")) as Manifest;

  it("has the marketplace shape, and agrees with the mapping", () => {
    expect(Object.keys(manifest).sort()).toEqual(
      ["apps", "category", "description", "docs", "emits", "id", "name", "platforms", "privacy", "publisher", "requirements", "setup", "status", "summary", "test", "version"],
    );
    expect(manifest).toMatchObject({ id: VIA, publisher: "FocusDeck", category: "tasks" });
    expect(["ready", "spike", "planned"]).toContain(manifest.status);
    for (const platform of manifest.platforms) expect(["macos", "linux", "windows"]).toContain(platform);
    expect(manifest.emits.map((e) => e.kind).sort()).toEqual(["agent-finished", "agent-needs-input", "notification"]);
    for (const emit of manifest.emits) expect(emit.app).toBe(APP);
    expect(manifest.apps).toEqual([{ id: APP, label: "GitHub", group: "tasks" }]);
    expect(manifest.privacy.sends).toEqual(["kind", "app", "source", "via"]);
    for (const step of manifest.setup) if (step.code) expect(["toml", "json", "bash"]).toContain(step.code.language);
    expect(manifest.setup.some((step) => step.code?.content.includes("{{FOCUSDECK_DIR}}/sensors/github/focusdeck-github.mjs"))).toBe(true);
    expect(existsSync(join(REPO, manifest.docs))).toBe(true);
  });

  it("its test command sends one sample event", async () => {
    const bridge = await fakeBridge();
    const command = manifest.test.command.replaceAll("{{FOCUSDECK_DIR}}", REPO.replace(/[\\/]+$/, "")).replaceAll("{{FOCUSDECK_URL}}", bridge.url);
    const run = await new Promise<{ code: number | null; stderr: string }>((resolve) => {
      const child = spawn("sh", ["-c", command], { env: { PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ""}`, NODE_ENV: "test" } });
      let stderr = "";
      child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
      child.on("close", (code) => resolve({ code, stderr }));
    });
    await bridge.close();
    expect(run.code).toBe(0);
    expect(run.stderr).toContain("focusdeck-github: sent");
    expect(bridge.received.map((r) => JSON.parse(r.body))).toEqual([{ kind: "notification", app: "github", source: hashThread("focusdeck-test"), via: "github" }]);
  });
});
