import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { childEnv, cliGenerator } from "./cli";
import { openAICompatibleGenerator } from "./openaiCompatible";
import type { RunOptions, RunResult } from "./process";
import { generatorFor, providerStatus } from "./providers";
import { checkWith, proposeWith } from "./tasks";

const request = { system: "SYSTEM PROMPT", prompt: 'Here is the data: {"intentions":["email @boss about it"]}', effort: "low" as const };
const ok = (stdout: string): RunResult => ({ code: 0, stdout, stderr: "", timedOut: false });

/** A stand-in for spawn that records exactly what FocusDeck would run. */
function recorder(answer: (args: string[], options: RunOptions) => RunResult | Promise<RunResult>) {
  const calls: { file: string; args: string[]; options: RunOptions }[] = [];
  const run = async (file: string, args: string[], options: RunOptions) => {
    calls.push({ file, args, options });
    return answer(args, options);
  };
  return { calls, run };
}

describe("subscription CLIs: run unmodified, signed in as you, with nothing to act on", () => {
  const env = { PATH: "/usr/bin", HOME: "/home/me", ANTHROPIC_API_KEY: "sk-ant", OPENAI_API_KEY: "sk-oai", GEMINI_API_KEY: "g", CLAUDE_CODE_USE_BEDROCK: "1", FOCUSDECK_SENSOR_TOKEN: "t" };

  it("strips API keys so the CLI uses your plan, and marks the run as FocusDeck's own", () => {
    const child = childEnv(env, { EXTRA: "1" });
    expect(child).toMatchObject({ PATH: "/usr/bin", HOME: "/home/me", EXTRA: "1", FOCUSDECK_INTERNAL: "1" });
    for (const key of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "CLAUDE_CODE_USE_BEDROCK", "FOCUSDECK_SENSOR_TOKEN"]) expect(child[key]).toBeUndefined();
  });

  it("runs Claude Code headless with no tools, MCP, hooks or project files, and the prompt on stdin", async () => {
    const { calls, run } = recorder(() => ok(JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "ready", modelUsage: { "claude-sonnet-5-5": {} } })));
    const result = await cliGenerator("claude-cli", { file: "/bin/claude", env, run })(request);
    expect(result).toEqual({ ok: true, text: "ready", model: "claude-sonnet-5-5" });
    const { args, options } = calls[0];
    expect(args.slice(0, 4)).toEqual(["-p", "--output-format", "json", "--safe-mode"]);
    expect(args[args.indexOf("--tools") + 1]).toBe("");
    expect(args).toEqual(expect.arrayContaining(["--strict-mcp-config", "--disallowedTools", "mcp__*", "--no-session-persistence", "--max-turns", "1"]));
    expect(args).not.toContain(request.prompt);
    expect(options.input).toBe(request.prompt);
    expect(options.env).toMatchObject({ FOCUSDECK_INTERNAL: "1", ENABLE_CLAUDEAI_MCP_SERVERS: "false" });
    expect(options.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(options.cwd).toMatch(/focusdeck-system-two-.*work$/);
  });

  it("reports a sign-in problem in the CLI's own words, and an old CLI plainly", async () => {
    const signedOut = recorder(() => ({ code: 1, stdout: JSON.stringify({ subtype: "success", is_error: true, result: "Invalid API key · Please run /login" }), stderr: "", timedOut: false }));
    expect(await cliGenerator("claude-cli", { file: "/bin/claude", env, run: signedOut.run })(request)).toEqual({ ok: false, reason: "Claude Code didn't answer: Invalid API key · Please run /login" });
    const old = recorder(() => ({ code: 1, stdout: "", stderr: "error: unknown option '--safe-mode'", timedOut: false }));
    const result = await cliGenerator("claude-cli", { file: "/bin/claude", env, run: old.run })(request);
    expect(result.ok === false && result.reason).toMatch(/may be too old/);
  });

  it("runs Codex read-only in an empty folder with its tools off, reading the last message from a file", async () => {
    const { calls, run } = recorder(async (args) => {
      await writeFile(args[args.indexOf("-o") + 1], "ready");
      return ok("");
    });
    const result = await cliGenerator("codex-cli", { file: "/bin/codex", env, run })({ ...request, schema: { type: "object" } });
    expect(result).toEqual({ ok: true, text: "ready", model: "Codex (your ChatGPT plan)" });
    const { args, options } = calls[0];
    expect(args.slice(0, 2)).toEqual(["exec", "--skip-git-repo-check"]);
    expect(args).toEqual(expect.arrayContaining(["--sandbox", "read-only", "--ignore-user-config", "--ephemeral", "web_search=\"disabled\"", "features.shell_tool=false", "--output-schema"]));
    expect(args[args.indexOf("-C") + 1]).toBe(options.cwd);
    expect(args.at(-1)).toBe("-");
    expect(options.env.OPENAI_API_KEY).toBeUndefined();
  });

  it("runs Gemini CLI with a deny-all policy and escapes @ so nothing reads a local file", async () => {
    const { calls, run } = recorder(() => ok(JSON.stringify({ response: "ready", stats: { models: { "gemini-3.8-flash": {} } } })));
    const result = await cliGenerator("gemini-cli", { file: "/bin/gemini", env, run })(request);
    expect(result).toEqual({ ok: true, text: "ready", model: "gemini-3.8-flash" });
    const { args, options } = calls[0];
    expect(args).toEqual(expect.arrayContaining(["-o", "json", "--approval-mode", "default", "-e", "none", "--policy", "--admin-policy"]));
    expect(options.input).toContain("email \\@boss");
    expect(options.env.GEMINI_SYSTEM_MD).toMatch(/system\.md$/);
    expect(options.env.GEMINI_API_KEY).toBeUndefined();
  });

  it("gives a reason, never a crash, when the CLI can't start or hangs", async () => {
    const missing = recorder(() => ({ code: null, stdout: "", stderr: "", timedOut: false, spawnError: "spawn ENOENT" }));
    expect(await cliGenerator("gemini-cli", { file: "/nope", env, run: missing.run })(request)).toEqual({ ok: false, reason: "Couldn't start Gemini CLI: spawn ENOENT" });
    const hung = recorder(() => ({ code: null, stdout: "", stderr: "", timedOut: true }));
    const result = await cliGenerator("codex-cli", { file: "/bin/codex", env, run: hung.run })(request);
    expect(result.ok === false && result.reason).toMatch(/took longer/);
  });
});

describe("API keys and local models over OpenAI-compatible HTTP", () => {
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("asks for json_schema output, sends the key, and parses the answer", async () => {
    const sent: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      sent.push({ url, init });
      return reply({ model: "gpt-5.5", choices: [{ finish_reason: "stop", message: { content: '{"proposals":[]}' } }] });
    }) as unknown as typeof fetch;
    const generate = openAICompatibleGenerator({ name: "OpenAI", baseUrl: "https://api.openai.com/v1/", apiKey: "sk-test", model: "gpt-5.5", jsonSchema: true, fetchImpl });
    const result = await generate({ ...request, schema: { type: "object" } });
    expect(result).toEqual({ ok: true, text: '{"proposals":[]}', model: "gpt-5.5" });
    expect(sent[0].url).toBe("https://api.openai.com/v1/chat/completions");
    expect((sent[0].init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    expect(JSON.parse(sent[0].init.body as string).response_format.type).toBe("json_schema");
  });

  it("falls back to a schema in the prompt when a server rejects json_schema", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      bodies.push(body);
      return body.response_format ? reply({ error: "unsupported" }, 400) : reply({ choices: [{ message: { content: '```json\n{"proposals":[]}\n```' } }] });
    }) as unknown as typeof fetch;
    const generate = openAICompatibleGenerator({ name: "LM Studio", baseUrl: "http://127.0.0.1:1234/v1", model: "local", jsonSchema: true, fetchImpl });
    const drafted = await proposeWith(generate, { modes: [], intentions: [], trapApps: [], reviewEveryMinutes: 60, patterns: { switchTargets: [], intentionResponses: [], meanTimeToCloseMinutes: null } });
    expect(drafted).toEqual({ ok: true, value: [], model: "local" });
    expect(bodies).toHaveLength(2);
    expect(JSON.stringify(bodies[1].messages)).toContain("JSON Schema");
  });

  it("explains a refusal, a bad key and an unreachable server", async () => {
    const answer = (res: Response | Error) => (async () => { if (res instanceof Error) throw res; return res; }) as unknown as typeof fetch;
    const base = { name: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-5.5", jsonSchema: true };
    expect(await openAICompatibleGenerator({ ...base, fetchImpl: answer(reply({ choices: [{ message: { content: null, refusal: "no" } }] })) })(request)).toMatchObject({ ok: false, reason: expect.stringMatching(/declined/) });
    expect(await openAICompatibleGenerator({ ...base, fetchImpl: answer(reply({}, 401)) })(request)).toMatchObject({ ok: false, reason: expect.stringMatching(/rejected the key/) });
    expect(await openAICompatibleGenerator({ ...base, fetchImpl: answer(new TypeError("fetch failed")) })(request)).toMatchObject({ ok: false, reason: expect.stringMatching(/Couldn't reach OpenAI/) });
  });
});

describe("provider status and choice", () => {
  it("says what's set up without spending a token, and what's missing in plain words", async () => {
    const noNetwork = (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch;
    expect(await providerStatus("openai", { OPENAI_API_KEY: "sk" }, noNetwork)).toMatchObject({ ready: true, model: "gpt-5.5" });
    expect(await providerStatus("openai", {}, noNetwork)).toMatchObject({ ready: false, detail: expect.stringMatching(/OPENAI_API_KEY/) });
    expect(await providerStatus("ollama", {}, noNetwork)).toMatchObject({ ready: false, detail: expect.stringMatching(/isn't answering/) });
    const ollama = (async () => new Response(JSON.stringify({ data: [{ id: "llama3.2" }, { id: "gpt-oss:20b" }] }))) as unknown as typeof fetch;
    expect(await providerStatus("ollama", {}, ollama)).toMatchObject({ ready: true, model: "gpt-oss:20b" });
  });

  it("finds a subscription CLI on PATH, and runs a connection check through it", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "focusdeck-path-"));
    try {
      await writeFile(path.join(dir, "gemini"), "#!/bin/sh\necho '{\"response\":\"ready\"}'\n", { mode: 0o755 });
      const status = await providerStatus("gemini-cli", { PATH: dir });
      expect(status).toMatchObject({ ready: true, detail: expect.stringContaining(path.join(dir, "gemini")) });
      expect(await providerStatus("claude-cli", { PATH: dir })).toMatchObject({ ready: false });
      const generate = await generatorFor("gemini-cli", { PATH: process.env.PATH + path.delimiter + dir, FOCUSDECK_GEMINI_CLI_PATH: path.join(dir, "gemini") });
      expect("error" in generate).toBe(false);
      if (!("error" in generate)) expect(await checkWith(generate)).toMatchObject({ ok: true, value: "ready" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
