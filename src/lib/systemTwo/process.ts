import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";

/**
 * Server-only process helpers for the subscription CLIs. No shell is ever
 * involved: the program and its arguments go straight to spawn, and the
 * prompt travels on stdin, so nothing in it can be read as a command.
 */

/** An environment to pass on: plain strings, so tests and callers needn't fake a whole process.env. */
export type Env = Record<string, string | undefined>;

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  /** The program couldn't be started at all (not found, not executable). */
  spawnError?: string;
}

export interface RunOptions {
  input: string;
  cwd: string;
  env: Env;
  timeoutMs: number;
  maxBytes?: number;
}

export type RunProcess = (file: string, args: string[], options: RunOptions) => Promise<RunResult>;

export const runProcess: RunProcess = (file, args, { input, cwd, env, timeoutMs, maxBytes = 4_000_000 }) =>
  new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const finish = (result: RunResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const child = spawn(file, args, { cwd, env: env as NodeJS.ProcessEnv, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2000).unref();
    }, timeoutMs);
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      if (stdout.length < maxBytes) stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      if (stderr.length < maxBytes) stderr += chunk;
    });
    child.on("error", (error) => finish({ code: null, stdout, stderr, timedOut, spawnError: error.message }));
    child.on("close", (code) => finish({ code, stdout, stderr, timedOut }));
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });

/** Find a program on PATH the way a shell would, without running a shell. */
export async function findOnPath(name: string, env: Env = process.env): Promise<string | null> {
  if (name.includes("/") || name.includes("\\")) {
    try {
      await access(name, constants.X_OK);
      return name;
    } catch {
      return null;
    }
  }
  const exts = process.platform === "win32" ? (env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];
  for (const dir of (env.PATH ?? "").split(path.delimiter).filter(Boolean)) {
    for (const ext of exts) {
      const candidate = path.join(dir, name + ext);
      try {
        await access(candidate, constants.X_OK);
        return candidate;
      } catch {
        // Keep looking.
      }
    }
  }
  return null;
}
