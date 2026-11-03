import { createHash } from "node:crypto";

/**
 * Cursor agent hook input → FocusDeck sensor event, for the catalog's
 * `cursor-agent` app.
 *
 * Hook input carries content: the prompt you typed and its attachments, the
 * transcript path, your workspace folders, your email address, the model. None
 * of it leaves this function. The event is built from constants plus one hash,
 * never by copying or filtering the input, so a field Cursor adds tomorrow
 * cannot ride along (Privacy Class E).
 */

export const APP = "cursor-agent";
/** This connector's id, sent as `via`. */
export const VIA = "cursor";

/** @typedef {"agent-finished" | "agent-resumed"} AgentKind */
/** @typedef {{ kind: AgentKind, app: "cursor-agent", source?: string, via: "cursor" }} AgentEvent */

/**
 * Cursor has no hook for "the agent is waiting for your approval", so nothing
 * maps to agent-needs-input (see README.md).
 * @type {Map<unknown, AgentKind>} A Map, so "__proto__" and friends map to nothing.
 */
const KIND_BY_HOOK_EVENT = new Map([
  ["stop", "agent-finished"],
  ["beforeSubmitPrompt", "agent-resumed"],
]);

/**
 * stop statuses that mean the agent stopped on its own. It either completed or
 * hit an error, and either way it needs your attention next. "aborted" means
 * you stopped it, so you are already there. A stop without a status still
 * means the loop ended, so it counts. status is an enum, read to decide and
 * never sent.
 */
export const FINISHED_STATUSES = Object.freeze(["completed", "error"]);

/**
 * Opaque, stable conversation id: the first 16 hex chars of sha256(conversation_id).
 * @param {string} conversationId
 */
export function hashConversation(conversationId) {
  return createHash("sha256").update(conversationId, "utf8").digest("hex").slice(0, 16);
}

/**
 * @param {unknown} input Parsed hook stdin.
 * @param {unknown} [registeredAs] The hook name from the command line (hooks.example.json passes it), used only when the input doesn't name its event.
 * @returns {AgentEvent | null} The event to send, or null to send nothing.
 */
export function toSensorEvent(input, registeredAs) {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const { hook_event_name: named, conversation_id: conversationId, status } = /** @type {Record<string, unknown>} */ (input);
  const hookEvent = named === undefined ? registeredAs : named;
  const kind = KIND_BY_HOOK_EVENT.get(hookEvent);
  if (kind === undefined) return null;
  if (hookEvent === "stop" && status !== undefined && !FINISHED_STATUSES.includes(/** @type {string} */ (status))) return null;
  return typeof conversationId === "string" && conversationId !== ""
    ? { kind, app: APP, source: hashConversation(conversationId), via: VIA }
    : { kind, app: APP, via: VIA };
}
