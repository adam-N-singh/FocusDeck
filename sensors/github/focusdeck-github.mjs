#!/usr/bin/env node
/**
 * FocusDeck's GitHub sensor: a small poller over your own `gh` login. Every
 * 60 s it runs `gh api --include notifications`, turns each notification it
 * hasn't reported yet into a metadata-only event (mapping.mjs), and POSTs
 * them to the local sensor bridge.
 *
 *   node focusdeck-github.mjs          poll until stopped
 *   node focusdeck-github.mjs --once   poll once and exit (for cron and the like)
 *   node focusdeck-github.mjs --test   send one sample event, without calling gh
 *
 * A sensor must never get in the way, so:
 * - with FOCUSDECK_INTERNAL=1 it sends nothing and exits at once;
 * - gh runs through execFile with an argument array, never a shell, with its
 *   prompts and update notices off, and without FocusDeck's token;
 * - it obeys GitHub's X-Poll-Interval and asks with If-Modified-Since, so an
 *   idle poll is a 304 that costs no rate limit;
 * - each notification is reported once. A state file under the OS temp dir
 *   remembers hashes of what was seen, never ids. The first run only
 *   remembers, so the backlog you already have isn't replayed as news;
 * - nothing is retried: an event the bridge didn't take is gone. The sensor
 *   keeps no queue of your activity;
 * - nothing reaches stdout, stderr stays quiet unless FOCUSDECK_DEBUG=1 (which
 *   logs counts and events, never a title, repository or URL), and every exit
 *   is 0.
 * Node >= 18 built-ins only, zero dependencies.
 */
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { closeSync, constants, fstatSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isHttpDate, parseGhResponse, selectNew, toSensorEvent } from "./mapping.mjs";

const POST_TIMEOUT_MS = 1500;
const GH_TIMEOUT_MS = 20_000;
/** GitHub's X-Poll-Interval is normally 60 s, and polling faster disobeys it. */
const MIN_INTERVAL_S = 60;
const MAX_SEEN = 1000;
const MAX_EVENTS_PER_POST = 100; // the bridge's limit per request
const DEBUG = process.env.FOCUSDECK_DEBUG === "1";
const FLAGS = new Set(process.argv.slice(2));

const done = () => process.exit(0);
// FocusDeck's own runs must not report themselves.
if (process.env.FOCUSDECK_INTERNAL === "1") done();
// Structural rather than a promise: not even a stray console.log can reach stdout.
process.stdout.write = () => true;
// Node's own warnings (e.g. Node 18's experimental-fetch notice) would print to stderr.
if (!DEBUG) process.removeAllListeners("warning");
process.on("uncaughtException", done);
process.on("unhandledRejection", done);
process.on("SIGINT", done);
process.on("SIGTERM", done);
// Backstop for a single poll: gh is killed after GH_TIMEOUT_MS, but a stuck pipe could still hold the callback.
if (FLAGS.has("--once") || FLAGS.has("--test")) setTimeout(done, GH_TIMEOUT_MS + 5000).unref();

function debug(message) {
  if (!DEBUG) return;
  try {
    writeSync(2, `focusdeck-github: ${message}\n`); // synchronous, so process.exit cannot cut it off
  } catch {
    // Debug output is best effort.
  }
}

/** An error's name and code, never its message: gh's messages repeat what it printed. */
const why = (error) => `${error?.name ?? "Error"} ${error?.cause?.code ?? error?.code ?? error?.signal ?? ""}`;

const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
// One file per user: on Linux the temp dir is shared.
const STATE_FILE = join(tmpdir(), `focusdeck-github-${uid ?? "user"}.json`);

/**
 * The state the last run left, or null when there is none to trust: no file,
 * a symlink, someone else's file, or anything malformed. Null makes a first run.
 * @returns {{ seen: string[], lastModified?: string } | null}
 */
function loadState() {
  let fd;
  try {
    // O_NOFOLLOW: in a shared temp dir, anyone could plant a symlink here.
    fd = openSync(STATE_FILE, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const stat = fstatSync(fd);
    if (!stat.isFile() || (uid !== undefined && stat.uid !== uid)) return null;
    const state = JSON.parse(readFileSync(fd, "utf8"));
    if (!Array.isArray(state?.seen)) return null;
    return {
      seen: state.seen.filter((key) => typeof key === "string" && /^[0-9a-f]{16}$/.test(key)),
      lastModified: isHttpDate(state.lastModified) ? state.lastModified : undefined,
    };
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/** Writes a fresh file and renames it into place, so a planted symlink is replaced rather than followed. */
function saveState(seen, lastModified) {
  const temp = `${STATE_FILE}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    writeFileSync(temp, JSON.stringify({ version: 1, lastModified, seen: [...seen] }), { mode: 0o600, flag: "wx" });
    renameSync(temp, STATE_FILE);
  } catch (error) {
    debug(`state not saved (${why(error)}); notifications may be reported again after a restart`);
    try {
      unlinkSync(temp);
    } catch {
      // Nothing was written.
    }
  }
}

/** Runs gh and resolves with the HTTP response it printed, or null. Never rejects. */
function askGitHub(lastModified) {
  const args = ["api", "--include", "notifications"];
  if (lastModified) args.push("--header", `If-Modified-Since: ${lastModified}`);
  const env = { ...process.env, GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1", GH_NO_EXTENSION_UPDATE_NOTIFIER: "1", NO_COLOR: "1" };
  for (const name of ["GH_FORCE_TTY", "CLICOLOR_FORCE", "FOCUSDECK_SENSOR_TOKEN"]) delete env[name];
  return new Promise((resolve) => {
    execFile("gh", args, { env, timeout: GH_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (error, stdout) => {
      const response = parseGhResponse(String(stdout ?? ""));
      if (response === null) debug(`gh gave no HTTP response (${why(error)}): is it installed, on PATH and logged in?`);
      resolve(response);
    });
  });
}

/** POSTs events in batches the bridge accepts. Never throws; nothing is retried. */
async function send(events) {
  const base = (process.env.FOCUSDECK_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
  const headers = { "Content-Type": "application/json" };
  if (process.env.FOCUSDECK_SENSOR_TOKEN) headers.Authorization = `Bearer ${process.env.FOCUSDECK_SENSOR_TOKEN}`;
  for (let i = 0; i < events.length; i += MAX_EVENTS_PER_POST) {
    const batch = events.slice(i, i + MAX_EVENTS_PER_POST);
    const body = JSON.stringify(batch.length === 1 ? batch[0] : batch);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), POST_TIMEOUT_MS);
    try {
      const response = await fetch(`${base}/api/sensor/events`, { method: "POST", headers, body, signal: controller.signal });
      debug(`sent ${body} -> ${response.status} ${DEBUG ? await response.text() : ""}`);
    } catch (error) {
      debug(`not sent: ${why(error)}`);
    } finally {
      clearTimeout(timer);
    }
  }
}

async function main() {
  if (FLAGS.has("--test")) return send([toSensorEvent({ id: "focusdeck-test", reason: "subscribed" })]);

  const state = loadState();
  const seen = new Set(state?.seen ?? []);
  let lastModified = state?.lastModified;
  let primed = state !== null;
  const configuredS = Math.max(MIN_INTERVAL_S, Number(process.env.FOCUSDECK_GITHUB_INTERVAL) || MIN_INTERVAL_S);
  let intervalS = configuredS;
  if (!primed) debug("no state yet: this first poll only remembers what is already there");

  const poll = async () => {
    const response = await askGitHub(lastModified);
    if (response === null) return;
    intervalS = Math.max(configuredS, response.pollInterval ?? 0);
    if (response.status === 304) return debug("nothing new (304)");
    if (response.status !== 200) return debug(`GitHub answered ${response.status}; nothing sent`);
    let threads;
    try {
      threads = JSON.parse(response.body);
    } catch {
      return debug("GitHub's answer wasn't JSON; nothing sent");
    }
    if (!Array.isArray(threads)) return debug("GitHub's answer wasn't a list; nothing sent");
    const { events, listed } = selectNew(threads, seen);
    // Re-adding moves still-listed notifications to the end, so trimming the oldest never forgets them.
    for (const key of listed) {
      seen.delete(key);
      seen.add(key);
    }
    for (const key of seen) {
      if (seen.size <= MAX_SEEN) break;
      seen.delete(key);
    }
    lastModified = response.lastModified ?? lastModified;
    saveState(seen, lastModified);
    if (!primed) {
      primed = true;
      return debug(`first run: remembered ${listed.length} notification(s), sent nothing`);
    }
    if (events.length === 0) return debug(`${listed.length} notification(s), none new`);
    await send(events);
  };

  if (FLAGS.has("--once")) return poll();
  for (;;) {
    await poll();
    await new Promise((resolve) => setTimeout(resolve, intervalS * 1000));
  }
}

main()
  .catch((error) => debug(`stopped: ${why(error)}`))
  .finally(done);
