#!/usr/bin/env node
/**
 * FocusDeck's Cursor sensor: a hook command (see hooks.example.json). Cursor
 * pipes each hook's input to stdin as JSON; mapping.mjs reduces it to a
 * metadata-only event, which is POSTed to the local sensor bridge. The hook's
 * name may follow on the command line, as a fallback for input that doesn't
 * name its event.
 *
 * A sensor that can break the agent it watches is worse than no sensor, so:
 * - with FOCUSDECK_INTERNAL=1 (FocusDeck running Cursor's agent for its own
 *   features) it sends nothing and exits at once;
 * - nothing ever reaches stdout. Cursor reads a hook's stdout as its answer,
 *   and a stop hook's answer can submit a follow-up message to the agent. With
 *   no answer and "failClosed": false, Cursor carries on as if the hook
 *   weren't there;
 * - stderr stays quiet unless FOCUSDECK_DEBUG=1, and even then it never echoes
 *   hook input, only the metadata event (Privacy Class E);
 * - every path exits 0: bad input, a down or slow bridge, a bug. Cursor waits
 *   for its hooks, so the bridge gets 1.5 s at most.
 * Node >= 18 built-ins only, zero dependencies.
 */
import { writeSync } from "node:fs";
import { toSensorEvent } from "./mapping.mjs";

const TIMEOUT_MS = 1500;
const DEBUG = process.env.FOCUSDECK_DEBUG === "1";

const done = () => process.exit(0);
// FocusDeck's own agent runs must not report themselves. Checked before stdin is even read.
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
    writeSync(2, `focusdeck-cursor: ${message}\n`); // synchronous, so process.exit cannot cut it off
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
  const event = toSensorEvent(input, process.argv[2]);
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
