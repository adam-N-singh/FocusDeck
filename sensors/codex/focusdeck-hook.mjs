#!/usr/bin/env node
/**
 * FocusDeck's Codex CLI sensor: one command for both of Codex's mechanisms.
 * - As a lifecycle hook (hooks.example.toml), Codex pipes the hook input to
 *   stdin as JSON.
 * - As the legacy `notify` program (notify.example.toml), Codex appends its
 *   JSON as the last argument and gives it no stdin.
 * mapping.mjs reduces either to a metadata-only event, which is POSTed to the
 * local sensor bridge.
 *
 * A sensor that can break the agent it watches is worse than no sensor, so:
 * - with FOCUSDECK_INTERNAL=1 (FocusDeck running Codex for its own features)
 *   it sends nothing and exits at once;
 * - nothing ever reaches stdout (a UserPromptSubmit hook's stdout is added to
 *   the model's context);
 * - stderr stays quiet unless FOCUSDECK_DEBUG=1, and even then it never echoes
 *   the input, only the metadata event (Privacy Class E);
 * - every path exits 0: bad input, a down or slow bridge, a bug.
 * Node >= 18 built-ins only, zero dependencies.
 */
import { writeSync } from "node:fs";
import { fromHook, fromNotify } from "./mapping.mjs";

const TIMEOUT_MS = 1500;
const DEBUG = process.env.FOCUSDECK_DEBUG === "1";

const done = () => process.exit(0);
// FocusDeck's own Codex runs must not report themselves. Checked before stdin is even read.
if (process.env.FOCUSDECK_INTERNAL === "1") done();
// Structural rather than a promise: not even a stray console.log can reach stdout.
process.stdout.write = () => true;
// Node's own warnings (e.g. Node 18's experimental-fetch notice) would print to stderr.
if (!DEBUG) process.removeAllListeners("warning");
process.on("uncaughtException", done);
process.on("unhandledRejection", done);
// Backstop in case stdin never closes (e.g. run by hand without a pipe).
setTimeout(done, TIMEOUT_MS + 2500).unref();

function debug(message) {
  if (!DEBUG) return;
  try {
    writeSync(2, `focusdeck-codex: ${message}\n`); // synchronous, so process.exit cannot cut it off
  } catch {
    // Debug output is best effort.
  }
}

async function main() {
  // notify passes exactly one argument, its JSON; a hook passes none.
  const notifyArg = process.argv.length > 2 ? process.argv[process.argv.length - 1] : undefined;
  let raw = notifyArg ?? "";
  if (notifyArg === undefined) {
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) raw += chunk;
  }

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return debug(`${notifyArg === undefined ? "stdin" : "the notify argument"} was not JSON; nothing sent`);
  }
  const event = notifyArg === undefined ? fromHook(input) : fromNotify(input);
  if (event === null) return debug("not a mapped Codex event; nothing sent");

  const base = (process.env.FOCUSDECK_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
  const headers = { "Content-Type": "application/json" };
  if (process.env.FOCUSDECK_SENSOR_TOKEN) headers.Authorization = `Bearer ${process.env.FOCUSDECK_SENSOR_TOKEN}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${base}/api/sensor/events`, {
      method: "POST",
      headers,
      body: JSON.stringify(event),
      signal: controller.signal,
    });
    debug(`sent ${JSON.stringify(event)} -> ${response.status} ${DEBUG ? await response.text() : ""}`);
  } finally {
    clearTimeout(timer);
  }
}

main()
  .catch((error) => debug(`not sent: ${error?.name ?? "Error"} ${error?.cause?.code ?? error?.cause?.message ?? error?.message ?? ""}`))
  .finally(done);
