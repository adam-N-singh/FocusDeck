import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP, VIA, hashSession } from "./mapping.mjs";
import { REPO, SESSION, SECRET, SOURCE, common, permission, stop, prompt, notify, fakeBridge, runSensor, type Manifest } from "./fixtures";

describe("focusdeck-hook.mjs end to end", { timeout: 15_000 }, () => {
  it("as a hook: POSTs exactly the mapped event as JSON, with the bearer token, and prints nothing", async () => {
    const bridge = await fakeBridge();
    const run = await runSensor({ stdin: JSON.stringify(permission), env: { FOCUSDECK_URL: `${bridge.url}/`, FOCUSDECK_SENSOR_TOKEN: "t0ken" } });
    await bridge.close();
    expect(run).toMatchObject({ code: 0, stdout: "", stderr: "" });
    expect(bridge.received).toHaveLength(1);
    const [request] = bridge.received;
    expect(request).toMatchObject({ method: "POST", url: "/api/sensor/events" });
    expect(request.headers["content-type"]).toContain("application/json");
    expect(request.headers.authorization).toBe("Bearer t0ken");
    expect(JSON.parse(request.body)).toEqual({ kind: "agent-needs-input", app: "codex", source: SOURCE, via: "codex" });
    for (const needle of [SECRET, SESSION, "payroll", "curl"]) expect(request.body).not.toContain(needle);
  });

  it("as notify: reads the last argument, never waits for stdin, and POSTs agent-finished", async () => {
    const bridge = await fakeBridge();
    const run = await runSensor({ stdin: null, args: [JSON.stringify(notify)], env: { FOCUSDECK_URL: bridge.url } });
    await bridge.close();
    expect(run).toMatchObject({ code: 0, stdout: "", stderr: "" });
    expect(run.ms).toBeLessThan(3000); // finished on its own, not by the 4 s backstop
    expect(bridge.received.map((r) => JSON.parse(r.body))).toEqual([{ kind: "agent-finished", app: "codex", source: SOURCE, via: "codex" }]);
    expect(bridge.received[0].body).not.toContain(SECRET);
  });

  it("sends no Authorization header when no token is set", async () => {
    const bridge = await fakeBridge();
    const run = await runSensor({ stdin: JSON.stringify(stop), env: { FOCUSDECK_URL: bridge.url } });
    await bridge.close();
    expect(run.code).toBe(0);
    expect(bridge.received[0].headers.authorization).toBeUndefined();
  });

  it("exits 0, silently, when the bridge is down", async () => {
    const bridge = await fakeBridge();
    await bridge.close(); // the port is now closed
    const runs = await Promise.all([
      runSensor({ stdin: JSON.stringify(stop), env: { FOCUSDECK_URL: bridge.url } }),
      runSensor({ args: [JSON.stringify(notify)], env: { FOCUSDECK_URL: bridge.url } }),
    ]);
    for (const run of runs) expect(run).toMatchObject({ code: 0, stdout: "", stderr: "" });
  });

  it("gives up after ~1.5 s on a bridge that never answers", async () => {
    const bridge = await fakeBridge({ answer: false });
    const run = await runSensor({ stdin: JSON.stringify(stop), env: { FOCUSDECK_URL: bridge.url } });
    await bridge.close();
    expect(run).toMatchObject({ code: 0, stdout: "", stderr: "" });
    expect(bridge.received).toHaveLength(1);
    expect(run.ms).toBeGreaterThanOrEqual(1400);
    expect(run.ms).toBeLessThan(3500); // the AbortController fired, not the 4 s backstop
  });

  it("exits 0 and sends nothing on bad input or unmapped events", async () => {
    const bridge = await fakeBridge();
    const runs = await Promise.all([
      ...["", "not json", "{", "null", "[]", '"Stop"', JSON.stringify({ ...common, hook_event_name: "PreToolUse", tool_input: { command: SECRET } })].map((stdin) =>
        runSensor({ stdin, env: { FOCUSDECK_URL: bridge.url } }),
      ),
      ...["not json", JSON.stringify({ ...notify, type: "approval-requested" }), JSON.stringify(stop)].map((arg) => runSensor({ args: [arg], env: { FOCUSDECK_URL: bridge.url } })),
    ]);
    await bridge.close();
    for (const run of runs) expect(run).toMatchObject({ code: 0, stdout: "", stderr: "" });
    expect(bridge.received).toHaveLength(0);
  });

  it("with FOCUSDECK_INTERNAL=1 sends nothing and exits at once, without waiting for stdin", async () => {
    const bridge = await fakeBridge();
    const env = { FOCUSDECK_URL: bridge.url, FOCUSDECK_INTERNAL: "1", FOCUSDECK_DEBUG: "1" };
    const runs = await Promise.all([runSensor({ stdin: null, env }), runSensor({ stdin: JSON.stringify(stop), env }), runSensor({ args: [JSON.stringify(notify)], env })]);
    await bridge.close();
    for (const run of runs) {
      expect(run).toMatchObject({ code: 0, stdout: "", stderr: "" });
      expect(run.ms).toBeLessThan(1500);
    }
    expect(bridge.received).toHaveLength(0);
  });

  it("with FOCUSDECK_DEBUG=1 explains itself on stderr, still never on stdout, and never echoes content", async () => {
    const bridge = await fakeBridge();
    const run = await runSensor({ stdin: JSON.stringify(prompt), env: { FOCUSDECK_URL: bridge.url, FOCUSDECK_DEBUG: "1" } });
    await bridge.close();
    expect(run).toMatchObject({ code: 0, stdout: "" });
    expect(run.stderr).toContain("focusdeck-codex: sent");
    expect(run.stderr).not.toContain(SECRET);
  });
});

describe("manifest.json", { timeout: 15_000 }, () => {
  const manifest = JSON.parse(readFileSync(new URL("./manifest.json", import.meta.url), "utf8")) as Manifest;

  it("has the marketplace shape, and agrees with the mapping", () => {
    expect(Object.keys(manifest).sort()).toEqual(
      ["apps", "category", "description", "docs", "emits", "id", "name", "platforms", "privacy", "publisher", "requirements", "setup", "status", "summary", "test", "version"],
    );
    expect(manifest).toMatchObject({ id: VIA, publisher: "FocusDeck", category: "agents" });
    expect(["ready", "spike", "planned"]).toContain(manifest.status);
    for (const platform of manifest.platforms) expect(["macos", "linux", "windows"]).toContain(platform);
    expect(manifest.emits.map((e) => e.kind).sort()).toEqual(["agent-finished", "agent-needs-input", "agent-resumed"]);
    for (const emit of manifest.emits) expect(emit.app).toBe(APP);
    expect(manifest.apps).toEqual([{ id: APP, label: "Codex CLI", group: "agents" }]);
    expect(manifest.privacy.sends).toEqual(["kind", "app", "source", "via"]);
    for (const step of manifest.setup) if (step.code) expect(["toml", "json", "bash"]).toContain(step.code.language);
    // The snippet the marketplace shows is hooks.example.toml, without its comments and with the path filled in.
    const snippet = manifest.setup.find((step) => step.code?.language === "toml")?.code?.content ?? "";
    const example = readFileSync(new URL("./hooks.example.toml", import.meta.url), "utf8").split("\n").filter((line) => !line.startsWith("#"));
    expect(snippet.replaceAll("{{FOCUSDECK_DIR}}", "/ABSOLUTE/PATH/TO/FocusDeck").trim()).toBe(example.join("\n").trim());
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
    expect(run.stderr).toContain("focusdeck-codex: sent");
    expect(bridge.received.map((r) => JSON.parse(r.body))).toEqual([{ kind: "agent-finished", app: "codex", source: hashSession("focusdeck-test"), via: "codex" }]);
  });
});
