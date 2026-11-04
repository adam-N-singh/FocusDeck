import { createHash } from "node:crypto";

/**
 * GitHub notification thread → FocusDeck sensor event (PRODUCT.md: "PR feeds
 * and agent fleets are the signal layer").
 *
 * A thread from GET /notifications carries content: the subject's title, the
 * repository (its name, owner, description and URLs), and API URLs that lead
 * back to both. None of it leaves this module. The event is built from
 * constants plus one hash of the thread id, never by copying or filtering the
 * thread, so a field GitHub adds tomorrow cannot ride along (Privacy Class E).
 * `reason` and `subject.type` are enums, read to decide and never sent.
 */

export const APP = "github";
/** This connector's id, sent as `via`. */
export const VIA = "github";

/** @typedef {"notification" | "agent-needs-input" | "agent-finished"} GithubKind */
/** @typedef {{ kind: GithubKind, app: "github", source: string, via: "github" }} GithubEvent */

/**
 * Reasons that mean more than "something happened". Every other reason, and
 * any reason GitHub adds later, is a plain notification.
 * @type {Map<unknown, GithubKind>} A Map, so "__proto__" and friends map to nothing.
 */
const KIND_BY_REASON = new Map([
  ["review_requested", "agent-needs-input"], // a pull request is waiting for your review
  ["approval_requested", "agent-needs-input"], // a deployment is waiting for your approval
  ["ci_activity", "agent-finished"], // a workflow run you triggered completed
  ["agent_session_finished", "agent-finished"], // a Copilot cloud agent session finished
]);

/** Subject types that are CI activity, whatever the reason. */
export const FINISHED_SUBJECT_TYPES = Object.freeze(["CheckSuite"]);

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

/** The first 16 hex chars of sha256(text). @param {string} text */
const hash16 = (text) => createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);

/**
 * Opaque, stable thread id: the first 16 hex chars of sha256(thread id).
 * @param {string} threadId
 */
export function hashThread(threadId) {
  return hash16(threadId);
}

/** @param {Record<string, unknown>} thread @returns {string | null} GitHub sends a string; a whole number is accepted too. */
function threadId(thread) {
  const { id } = thread;
  if (typeof id === "string" && id !== "") return id;
  if (typeof id === "number" && Number.isSafeInteger(id) && id >= 0) return String(id);
  return null;
}

/**
 * @param {unknown} thread One element of GET /notifications.
 * @returns {GithubEvent | null} The event to send, or null to send nothing.
 */
export function toSensorEvent(thread) {
  if (!isRecord(thread)) return null;
  const id = threadId(thread);
  if (id === null || thread.unread === false) return null;
  const subjectType = isRecord(thread.subject) ? thread.subject.type : undefined;
  const kind =
    KIND_BY_REASON.get(thread.reason) ??
    (FINISHED_SUBJECT_TYPES.includes(/** @type {string} */ (subjectType)) ? "agent-finished" : "notification");
  return { kind, app: APP, source: hashThread(id), via: VIA };
}

/**
 * What makes a notification new: its thread plus `updated_at`. GitHub keeps
 * one thread per pull request, issue or run, and bumps `updated_at` when there
 * is news on it, so one thread can bring several notifications. Hashed, so the
 * state file holds no thread ids either.
 * @param {unknown} thread
 * @returns {string | null}
 */
export function seenKey(thread) {
  if (!isRecord(thread)) return null;
  const id = threadId(thread);
  if (id === null) return null;
  return hash16(`${id}\n${typeof thread.updated_at === "string" ? thread.updated_at : ""}`);
}

/**
 * One poll's worth of work.
 * @param {unknown} threads The parsed GET /notifications body.
 * @param {ReadonlySet<string>} seen Keys already reported.
 * @returns {{ events: GithubEvent[], listed: string[] }} The events to send for
 *   notifications not seen before, and the keys of every notification listed,
 *   to remember.
 */
export function selectNew(threads, seen) {
  /** @type {GithubEvent[]} */
  const events = [];
  /** @type {string[]} */
  const listed = [];
  if (!Array.isArray(threads)) return { events, listed };
  for (const thread of threads) {
    const key = seenKey(thread);
    if (key === null || listed.includes(key)) continue;
    listed.push(key);
    if (seen.has(key)) continue;
    const event = toSensorEvent(thread);
    if (event !== null) events.push(event);
  }
  return { events, listed };
}

/** An HTTP date, as in Last-Modified: "Tue, 03 Nov 2026 09:12:44 GMT". */
const HTTP_DATE = /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/;

/** @param {unknown} value @returns {value is string} Whether value can go back to GitHub as If-Modified-Since. */
export const isHttpDate = (value) => typeof value === "string" && HTTP_DATE.test(value);

/**
 * Splits `gh api --include` output into its status, the two headers the poller
 * obeys, and the body. gh prints the status line, then the headers, a blank
 * line and the body, for every status. It exits 1 for anything above 299, 304
 * included, so callers read stdout either way.
 * @param {string} stdout
 * @returns {{ status: number, pollInterval?: number, lastModified?: string, body: string } | null}
 *   null when stdout holds no HTTP response, e.g. gh failed before asking.
 */
export function parseGhResponse(stdout) {
  const statusLine = /^HTTP\/[\d.]+ (\d{3})\b[^\n]*\n/.exec(stdout);
  if (statusLine === null) return null;
  const rest = stdout.slice(statusLine[0].length);
  const blank = /(?:^|\r?\n)\r?\n/.exec(rest);
  const head = blank === null ? rest : rest.slice(0, blank.index);
  const body = blank === null ? "" : rest.slice(blank.index + blank[0].length);
  /** @type {{ status: number, pollInterval?: number, lastModified?: string, body: string }} */
  const response = { status: Number(statusLine[1]), body };
  for (const line of head.split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon < 1) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (name === "x-poll-interval" && /^\d{1,5}$/.test(value) && Number(value) > 0) response.pollInterval = Number(value);
    if (name === "last-modified" && isHttpDate(value)) response.lastModified = value;
  }
  return response;
}
