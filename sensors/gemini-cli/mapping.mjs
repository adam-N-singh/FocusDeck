import { createHash } from "node:crypto";

/**
 * Gemini CLI hook input → FocusDeck sensor event.
 *
 * Hook input carries content: the prompt you typed, the agent's final reply,
 * the tool waiting for confirmation and its arguments (in the notification's
 * message and details), the transcript path, the working directory. None of it
 * leaves this function. The event is built from constants plus one hash, never
 * by copying or filtering the input, so a field Gemini CLI adds tomorrow
 * cannot ride along (Privacy Class E).
 */

export const APP = "gemini-cli";
/** This connector's id, sent as `via`. */
export const VIA = "gemini-cli";

/** @typedef {"agent-needs-input" | "agent-finished" | "agent-resumed"} AgentKind */
/** @typedef {{ kind: AgentKind, app: "gemini-cli", source?: string, via: "gemini-cli" }} AgentEvent */

/** @type {Map<unknown, AgentKind>} A Map, so "__proto__" and friends map to nothing. */
const KIND_BY_HOOK_EVENT = new Map([
  ["Notification", "agent-needs-input"],
  ["AfterAgent", "agent-finished"],
  ["BeforeAgent", "agent-resumed"],
]);

/**
 * Notification types that mean this session is blocked on you. Gemini CLI
 * fires the Notification hook just before it shows a tool confirmation and
 * waits for your answer. ToolPermission is the only type it defines, and every
 * version with hooks sends one, so a missing or unknown type is dropped until
 * someone decides what it means. notification_type is an enum, read to decide
 * and never sent.
 */
export const NEEDS_INPUT_NOTIFICATIONS = Object.freeze(["ToolPermission"]);

/**
 * Opaque, stable session id: the first 16 hex chars of sha256(session_id).
 * @param {string} sessionId
 */
export function hashSession(sessionId) {
  return createHash("sha256").update(sessionId, "utf8").digest("hex").slice(0, 16);
}

/**
 * @param {unknown} input Parsed hook stdin.
 * @returns {AgentEvent | null} The event to send, or null to send nothing.
 */
export function toSensorEvent(input) {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const { hook_event_name: hookEvent, session_id: sessionId, notification_type: notificationType } = /** @type {Record<string, unknown>} */ (input);
  const kind = KIND_BY_HOOK_EVENT.get(hookEvent);
  if (kind === undefined) return null;
  if (hookEvent === "Notification" && !NEEDS_INPUT_NOTIFICATIONS.includes(/** @type {string} */ (notificationType))) return null;
  return typeof sessionId === "string" && sessionId !== "" ? { kind, app: APP, source: hashSession(sessionId), via: VIA } : { kind, app: APP, via: VIA };
}
