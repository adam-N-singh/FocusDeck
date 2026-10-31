import { createHash } from "node:crypto";

/**
 * Claude Code hook input → FocusDeck sensor event (ASSESSMENT.md §6, Stage 0
 * spike (b): agent events without reading message content).
 *
 * Hook input carries content — the prompt you typed, the notification text,
 * Claude's last reply, background task commands, the transcript path, the
 * working directory. None of it leaves this function: the event is built from
 * constants plus one hash, never by copying or filtering the input, so a field
 * Claude Code adds tomorrow cannot ride along (Privacy Class E).
 */

export const APP = "claude-code";

/** @typedef {"agent-needs-input" | "agent-finished" | "agent-resumed"} AgentKind */
/** @typedef {{ kind: AgentKind, app: "claude-code", source?: string }} AgentEvent */

/** @type {Map<unknown, AgentKind>} A Map, so "__proto__" and friends map to nothing. */
const KIND_BY_HOOK_EVENT = new Map([
  ["Notification", "agent-needs-input"],
  ["Stop", "agent-finished"],
  ["UserPromptSubmit", "agent-resumed"],
]);

/**
 * Notification types that mean this session is blocked on you. Claude Code
 * also notifies when it is not: idle_prompt repeats a Stop 60 s later (it would
 * turn every finished task into an ageing open loop), auth_success and quota_*
 * are status, and agent view's agent_needs_input / agent_completed describe
 * other, background sessions. notification_type is an enum, read to decide and
 * never sent. Older Claude Code without it falls back to agent-needs-input.
 */
export const NEEDS_INPUT_NOTIFICATIONS = Object.freeze(["permission_prompt", "elicitation_dialog", "elicitation_url_dialog"]);

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
  if (hookEvent === "Notification" && notificationType !== undefined && !NEEDS_INPUT_NOTIFICATIONS.includes(/** @type {string} */ (notificationType))) {
    return null;
  }
  return typeof sessionId === "string" && sessionId !== "" ? { kind, app: APP, source: hashSession(sessionId) } : { kind, app: APP };
}
