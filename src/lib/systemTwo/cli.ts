import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { schemaInstruction } from "./openaiCompatible";
import { runProcess, type Env, type RunProcess, type RunResult } from "./process";
import type { Generate, GenerateOutcome, GenerateRequest } from "./tasks";

/**
 * Server-only: System Two on the subscriptions you already pay for, by running
 * each provider's own, unmodified CLI — signed in as you — once per request.
 * FocusDeck never reads, copies or forwards a login token; it starts the
 * program and reads its answer. Every run:
 * - happens only because you pressed a button (never on a schedule);
 * - starts in a fresh, empty temp folder, with no shell, the prompt on stdin;
 * - asks the CLI to load no tools, MCP servers, hooks, plugins or project
 *   files (flags per CLI below, from each one's own docs);
 * - drops API keys from the environment, so the CLI uses your sign-in, and
 *   sets FOCUSDECK_INTERNAL=1 so FocusDeck's own connectors ignore the run.
 */
export type CliProviderId = "claude-cli" | "codex-cli" | "gemini-cli";

export interface CliSpec {
  command: string;
  product: string;
  install: string;
  pathEnv: string;
  modelEnv: string;
}

export const CLI_SPECS: Record<CliProviderId, CliSpec> = {
  "claude-cli": { command: "claude", product: "Claude Code", install: "Install Claude Code, then run `claude` once and sign in with your Claude plan.", pathEnv: "FOCUSDECK_CLAUDE_CLI_PATH", modelEnv: "FOCUSDECK_CLAUDE_CLI_MODEL" },
  "codex-cli": { command: "codex", product: "Codex CLI", install: "Install the Codex CLI, then run `codex login` with your ChatGPT account.", pathEnv: "FOCUSDECK_CODEX_CLI_PATH", modelEnv: "FOCUSDECK_CODEX_CLI_MODEL" },
  "gemini-cli": { command: "gemini", product: "Gemini CLI", install: "Install the Gemini CLI, then run `gemini` once and sign in with Google.", pathEnv: "FOCUSDECK_GEMINI_CLI_PATH", modelEnv: "FOCUSDECK_GEMINI_CLI_MODEL" },
};

export const isCliProvider = (id: string): id is CliProviderId => id in CLI_SPECS;

/** Keys that would make a CLI bill an API account instead of your plan — and that it has no need to see. */
export const STRIPPED_ENV = [
  "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "OPENAI_API_KEY", "CODEX_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY",
  "OPENROUTER_API_KEY", "FOCUSDECK_OPENAI_COMPAT_API_KEY", "FOCUSDECK_SENSOR_TOKEN",
];

export function childEnv(base: Env, extra: Record<string, string> = {}): Env {
  const env: Env = { ...base };
  for (const key of Object.keys(env)) if (STRIPPED_ENV.includes(key) || key.startsWith("CLAUDE_CODE_USE_")) delete env[key];
  return { ...env, ...extra, FOCUSDECK_INTERNAL: "1" };
}

interface Plan {
  args: string[];
  input: string;
  env: Record<string, string>;
  read: (result: RunResult) => Promise<GenerateOutcome>;
}

const TIMEOUT_MS = 120_000;
const firstLine = (text: string) => text.trim().split("\n").find((l) => l.trim())?.trim().slice(0, 200) ?? "";
const parse = (text: string): Record<string, unknown> | null => {
  try {
    const value = JSON.parse(text);
    return typeof value === "object" && value !== null ? value : null;
  } catch {
    return null;
  }
};

/** Why a run failed, in words a person can act on. */
function failure(product: string, result: RunResult, said?: string): GenerateOutcome {
  if (result.spawnError) return { ok: false, reason: `Couldn't start ${product}: ${result.spawnError}` };
  if (result.timedOut) return { ok: false, reason: `${product} took longer than ${TIMEOUT_MS / 1000} s, so FocusDeck stopped it.` };
  const why = said || firstLine(result.stderr) || firstLine(result.stdout);
  if (/unknown (option|argument)|unexpected argument|unrecognized/i.test(why)) {
    return { ok: false, reason: `Your ${product} didn't accept FocusDeck's safety options — it may be too old. Update it, then test again. (${why})` };
  }
  return { ok: false, reason: `${product} didn't answer${why ? `: ${why}` : ` (exit code ${result.code})`}` };
}

const PLANS: Record<CliProviderId, (req: GenerateRequest, dir: string, work: string, model?: string) => Promise<Plan>> = {
  // Claude Code, headless (code.claude.com/docs/en/headless, cli-reference): --safe-mode keeps your
  // sign-in but loads no CLAUDE.md, skills, plugins, hooks, MCP or memory; --tools "" removes every tool.
  "claude-cli": async ({ system, prompt, schema }, dir, _work, model) => {
    const sysFile = path.join(dir, "system.md");
    await writeFile(sysFile, schema ? system + schemaInstruction(schema) : system);
    return {
      args: [
        "-p", "--output-format", "json", "--safe-mode", "--tools", "", "--disallowedTools", "mcp__*", "--strict-mcp-config",
        "--settings", '{"disableAllHooks":true}', "--disable-slash-commands", "--permission-mode", "dontAsk",
        "--no-session-persistence", "--max-turns", "1", ...(model ? ["--model", model] : []), "--system-prompt-file", sysFile,
      ],
      input: prompt,
      env: { ENABLE_CLAUDEAI_MCP_SERVERS: "false" },
      read: async (result) => {
        const out = parse(result.stdout);
        if (out?.subtype === "success" && out.is_error !== true && typeof out.result === "string" && out.result.trim()) {
          const used = out.modelUsage && typeof out.modelUsage === "object" ? Object.keys(out.modelUsage)[0] : undefined;
          return { ok: true, text: out.result, model: used ?? model ?? "Claude Code (your plan)" };
        }
        return failure("Claude Code", result, typeof out?.result === "string" ? firstLine(out.result) : undefined);
      },
    };
  },
  // Codex, non-interactive (github.com/openai/codex, exec): no documented way to remove every tool, so it
  // runs read-only in an empty folder, with your config ignored and its shell, web and app tools off.
  "codex-cli": async ({ system, prompt, schema }, dir, work, model) => {
    const outFile = path.join(dir, "answer.txt");
    const schemaFile = path.join(dir, "schema.json");
    if (schema) await writeFile(schemaFile, JSON.stringify(schema));
    const off = ["shell_tool", "unified_exec", "view_image", "apps", "plugins", "multi_agent", "browser_use", "computer_use"];
    return {
      args: [
        "exec", "--skip-git-repo-check", "--ephemeral", "--ignore-user-config", "--ignore-rules", "--sandbox", "read-only",
        "-C", work, "--json", "-o", outFile, "-c", `developer_instructions=${JSON.stringify(system)}`, "-c", 'web_search="disabled"',
        ...off.flatMap((f) => ["-c", `features.${f}=false`]), ...(model ? ["-m", model] : []), ...(schema ? ["--output-schema", schemaFile] : []), "-",
      ],
      input: prompt,
      env: {},
      read: async (result) => {
        const answer = await readFile(outFile, "utf8").catch(() => "");
        if (result.code === 0 && answer.trim()) return { ok: true, text: answer, model: model ?? "Codex (your ChatGPT plan)" };
        const said = result.stdout.split("\n").map(parse).find((e) => e?.type === "turn.failed" || e?.type === "error");
        const message = said && (typeof said.message === "string" ? said.message : typeof (said.error as { message?: unknown })?.message === "string" ? (said.error as { message: string }).message : undefined);
        return failure("Codex", result, message ? firstLine(message) : undefined);
      },
    };
  },
  // Gemini CLI, headless (github.com/google-gemini/gemini-cli, docs/cli/headless.md): a deny-all policy and an
  // empty core tool list leave no tools; "@" is escaped because "@path" would make the CLI read a local file.
  "gemini-cli": async ({ system, prompt, schema }, dir, _work, model) => {
    const sysFile = path.join(dir, "system.md");
    const settingsFile = path.join(dir, "settings.json");
    const policyFile = path.join(dir, "deny-all.toml");
    await writeFile(sysFile, schema ? system + schemaInstruction(schema) : system);
    await writeFile(settingsFile, JSON.stringify({ tools: { core: [] }, admin: { mcp: { enabled: false }, extensions: { enabled: false }, skills: { enabled: false } }, hooksConfig: { enabled: false } }));
    await writeFile(policyFile, '[[rule]]\ntoolName = "*"\ndecision = "deny"\npriority = 999\n');
    return {
      args: ["-p", "Respond to the input above.", "-o", "json", ...(model ? ["-m", model] : []), "--approval-mode", "default", "-e", "none", "--skip-trust", "--policy", policyFile, "--admin-policy", policyFile],
      input: prompt.replaceAll("@", "\\@"),
      env: { GEMINI_SYSTEM_MD: sysFile, GEMINI_CLI_SYSTEM_SETTINGS_PATH: settingsFile },
      read: async (result) => {
        const out = parse(result.stdout);
        const error = out?.error as { message?: unknown } | undefined;
        if (result.code === 0 && !error && typeof out?.response === "string" && out.response.trim()) {
          const models = (out.stats as { models?: Record<string, unknown> } | undefined)?.models;
          return { ok: true, text: out.response, model: (models && Object.keys(models)[0]) ?? model ?? "Gemini CLI (your Google account)" };
        }
        return failure("Gemini CLI", result, typeof error?.message === "string" ? firstLine(error.message) : undefined);
      },
    };
  },
};

export interface CliOptions {
  file: string;
  model?: string;
  env: Env;
  run?: RunProcess;
  timeoutMs?: number;
}

export function cliGenerator(id: CliProviderId, { file, model, env, run = runProcess, timeoutMs = TIMEOUT_MS }: CliOptions): Generate {
  return async (request) => {
    if (process.platform === "win32" && /\.(cmd|bat)$/i.test(file)) {
      return { ok: false, reason: `${CLI_SPECS[id].product} is a script wrapper on Windows, which FocusDeck won't start without a shell. Run FocusDeck in WSL for this option.` };
    }
    const dir = await mkdtemp(path.join(os.tmpdir(), "focusdeck-system-two-"));
    try {
      const work = path.join(dir, "work");
      await mkdir(work);
      const plan = await PLANS[id](request, dir, work, model);
      const result = await run(file, plan.args, { input: plan.input, cwd: work, env: childEnv(env, plan.env), timeoutMs });
      return await plan.read(result);
    } catch (error) {
      return { ok: false, reason: `${CLI_SPECS[id].product} couldn't be run: ${error instanceof Error ? error.message : "unknown error"}` };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };
}
