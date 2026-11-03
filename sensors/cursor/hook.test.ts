import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP, VIA, hashConversation } from "./mapping.mjs";
import { REPO, CONVERSATION, SECRET, SOURCE, common, stop, prompt, unnamed, fakeBridge, runHook, type Manifest } from "./fixtures";

describe("focusdeck-hook.mjs end to end", { timeout: 15_000 }, () => {
  it("POSTs exactly the mapped event as JSON, with the bearer token, and prints nothing", async () => {
    const bridge = await fakeBridge();
    const run = await runHook(JSON.stringify(prompt), { FOCUSDECK_URL: `${bridge.url}/`, FOCUSDECK_SENSOR_TOKEN: "t0ken" }, ["beforeSubmitPrompt"]);
    await bridge.close();
    expect(run).toMatchObject({ code: 0, stdout: "", stderr: "" });
    expect(bridge.received).toHaveLength(1);
    const [request] = bridge.received;
    expect(request).toMatchObject({ method: "POST", url: "/api/sensor/events" });
    expect(request.headers["content-type"]).toContain("application/json");
    expect(request.headers.authorization).toBe("Bearer t0ken");
    expect(JSON.parse(request.body)).toEqual({ kind: "agent-resumed", app: "cursor-agent", source: SOURCE, via: "cursor" });
    for (const needle of [SECRET, CONVERSATION, "payroll", "dev@"]) expect(request.body).not.toContain(needle);
  });

  it("uses the hook name from the command line when the input doesn't carry one", async () => {
    const bridge = await fakeBridge();
    const run = await runHook(JSON.stringify(unnamed(stop)), { FOCUSDECK_URL: bridge.url }, ["stop"]);
    await bridge.close();
    expect(run).toMatchObject({ code: 0, stdout: "", stderr: "" });
    expect(bridge.received.map((r) => JSON.parse(r.body))).toEqual([{ kind: "agent-finished", app: "cursor-agent", source: SOURCE, via: "cursor" }]);
  });

  it("sends no Authorization header when no token is set", async () => {
    const bridge = await fakeBridge();
    const run = await runHook(JSON.stringify(stop), { FOCUSDECK_URL: bridge.url }, ["stop"]);
    await bridge.close();
    expect(run.code).toBe(0);
    expect(bridge.received[0].headers.authorization).toBeUndefined();
  });

  it("exits 0, silently and quickly, when the bridge is down", async () => {
    const bridge = await fakeBridge();
    await bridge.close(); // the port is now closed
    const run = await runHook(JSON.stringify(stop), { FOCUSDECK_URL: bridge.url }, ["stop"]);
    expect(run).toMatchObject({ code: 0, stdout: "", stderr: "" });
    expect(run.ms).toBeLessThan(1500); // Cursor waits for its hooks: a refused connection must not cost the timeout
  });

  it("gives up after ~1.5 s on a bridge that never answers", async () => {
    const bridge = await fakeBridge({ answer: false });
    const run = await runHook(JSON.stringify(stop), { FOCUSDECK_URL: bridge.url }, ["stop"]);
    await bridge.close();
    expect(run).toMatchObject({ code: 0, stdout: "", stderr: "" });
    expect(bridge.received).toHaveLength(1);
    expect(run.ms).toBeGreaterThanOrEqual(1400);
    expect(run.ms).toBeLessThan(3500); // the AbortController fired, not the 4 s backstop
  });

  it("exits 0 and sends nothing on bad input, unmapped events or an aborted stop", async () => {
    const bridge = await fakeBridge();
    const inputs = ["", "not json", "{", "null", "[]", '"stop"', JSON.stringify({ ...common, hook_event_name: "beforeShellExecution", command: SECRET }), JSON.stringify({ ...stop, status: "aborted" })];
    const runs = await Promise.all(inputs.map((stdin) => runHook(stdin, { FOCUSDECK_URL: bridge.url }, ["stop"])));
    await bridge.close();
    for (const run of runs) expect(run).toMatchObject({ code: 0, stdout: "", stderr: "" });
    expect(bridge.received).toHaveLength(0);
  });

  it("with FOCUSDECK_INTERNAL=1 sends nothing and exits at once, without waiting for stdin", async () => {
    const bridge = await fakeBridge();
    const env = { FOCUSDECK_URL: bridge.url, FOCUSDECK_INTERNAL: "1", FOCUSDECK_DEBUG: "1" };
    const runs = await Promise.all([runHook(null, env, ["stop"]), runHook(JSON.stringify(stop), env, ["stop"])]);
    await bridge.close();
    for (const run of runs) {
      expect(run).toMatchObject({ code: 0, stdout: "", stderr: "" });
      expect(run.ms).toBeLessThan(1500);
    }
    expect(bridge.received).toHaveLength(0);
  });

  it("with FOCUSDECK_DEBUG=1 explains itself on stderr, still never on stdout, and never echoes content", async () => {
    const bridge = await fakeBridge();
    const run = await runHook(JSON.stringify(prompt), { FOCUSDECK_URL: bridge.url, FOCUSDECK_DEBUG: "1" }, ["beforeSubmitPrompt"]);
    await bridge.close();
    expect(run).toMatchObject({ code: 0, stdout: "" });
    expect(run.stderr).toContain("focusdeck-cursor: sent");
    expect(run.stderr).not.toContain(SECRET);
  });
});

describe("manifest.json", { timeout: 15_000 }, () => {
  const manifest = JSON.parse(readFileSync(new URL("./manifest.json", import.meta.url), "utf8")) as Manifest;

  it("has the marketplace shape, introduces no app, and agrees with the mapping and hooks.example.json", () => {
    expect(Object.keys(manifest).sort()).toEqual(
      ["category", "description", "docs", "emits", "id", "name", "platforms", "privacy", "publisher", "requirements", "setup", "status", "summary", "test", "version"],
    );
    expect(manifest).toMatchObject({ id: VIA, publisher: "FocusDeck", category: "agents" });
    expect(["ready", "spike", "planned"]).toContain(manifest.status);
    for (const platform of manifest.platforms) expect(["macos", "linux", "windows"]).toContain(platform);
    expect(manifest.emits.map((e) => e.kind).sort()).toEqual(["agent-finished", "agent-resumed"]);
    for (const emit of manifest.emits) expect(emit.app).toBe(APP);
    expect(manifest.privacy.sends).toEqual(["kind", "app", "source", "via"]);
    for (const step of manifest.setup) if (step.code) expect(["toml", "json", "bash"]).toContain(step.code.language);
    const snippet = manifest.setup.find((step) => step.code?.language === "json")?.code?.content ?? "";
    const example = readFileSync(new URL("./hooks.example.json", import.meta.url), "utf8");
    expect(JSON.parse(snippet.replaceAll("{{FOCUSDECK_DIR}}", "/ABSOLUTE/PATH/TO/FocusDeck"))).toEqual(JSON.parse(example));
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
    expect(run.stderr).toContain("focusdeck-cursor: sent");
    expect(bridge.received.map((r) => JSON.parse(r.body))).toEqual([{ kind: "agent-finished", app: "cursor-agent", source: hashConversation("focusdeck-test"), via: "cursor" }]);
  });
});
