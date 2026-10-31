#!/usr/bin/env node
/**
 * FocusDeck's Claude Code sensor: a hook command (see settings.example.json).
 * Claude Code pipes each hook's input to stdin as JSON; mapping.mjs reduces it
 * to a metadata-only event, which is POSTed to the local sensor bridge.
 *
 * A sensor that can break the agent it watches is worse than no sensor, so:
 * - nothing ever reaches stdout (a UserPromptSubmit hook's stdout is injected
 *   into Claude's context);
 * - stderr stays quiet unless FOCUSDECK_DEBUG=1, and even then it never echoes
 *   hook input, only the metadata event (Privacy Class E);
 * - every path exits 0: bad input, a down or slow bridge, a bug.
 * Node >= 18 built-ins only, zero dependencies.
 */
import { writeSync } from "node:fs";
import { toSensorEvent } from "./mapping.mjs";

const TIMEOUT_MS = 1500;
const DEBUG = process.env.FOCUSDECK_DEBUG === "1";

const done = () => process.exit(0);
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
    writeSync(2, `focusdeck-hook: ${message}\n`); // synchronous, so process.exit cannot cut it off
  } catch {
    // Debug output is best effort.
  }
}

async function main() {
  let raw = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) raw += chunk;

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return debug("stdin was not JSON; nothing sent");
  }
  const event = toSensorEvent(input);
  if (event === null) return debug("not a mapped hook event; nothing sent");

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
