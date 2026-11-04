import { createHash } from "node:crypto";

/**
 * Codex CLI → FocusDeck sensor event. Two native inputs arrive here: a
 * lifecycle hook's stdin, and the legacy `notify` program's argument.
 *
 * Both carry content: the prompt you typed, Codex's last reply, the command
 * waiting for your approval and its arguments, the transcript path, the
 * working directory. None of it leaves this module. The event is built from
 * constants plus one hash, never by copying or filtering the input, so a field
 * Codex adds tomorrow cannot ride along (Privacy Class E).
 */

export const APP = "codex";
/** This connector's id, sent as `via`. */
export const VIA = "codex";

/** @typedef {"agent-needs-input" | "agent-finished" | "agent-resumed"} AgentKind */
/** @typedef {{ kind: AgentKind, app: "codex", source?: string, via: "codex" }} AgentEvent */

/** @type {Map<unknown, AgentKind>} Lifecycle hooks. A Map, so "__proto__" and friends map to nothing. */
const KIND_BY_HOOK_EVENT = new Map([
  ["PermissionRequest", "agent-needs-input"],
  ["Stop", "agent-finished"],
  ["UserPromptSubmit", "agent-resumed"],
]);

/** @type {Map<unknown, AgentKind>} The legacy `notify` payload's `type`. */
const KIND_BY_NOTIFY_TYPE = new Map([["agent-turn-complete", "agent-finished"]]);

/**
 * Opaque, stable session id: the first 16 hex chars of sha256 of the native id.
 * A hook's `session_id` and notify's `thread-id` are the same id for the main
 * agent, so a session gets the same source from either mechanism.
 * @param {string} sessionId
 */
export function hashSession(sessionId) {
  return createHash("sha256").update(sessionId, "utf8").digest("hex").slice(0, 16);
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * @param {AgentKind} kind
 * @param {unknown} id The native session id, if any.
 * @returns {AgentEvent}
 */
function build(kind, id) {
  return typeof id === "string" && id !== "" ? { kind, app: APP, source: hashSession(id), via: VIA } : { kind, app: APP, via: VIA };
}

/**
 * @param {unknown} input Parsed hook stdin.
 * @returns {AgentEvent | null} The event to send, or null to send nothing.
 */
export function fromHook(input) {
  if (!isRecord(input)) return null;
  const { hook_event_name: hookEvent, session_id: sessionId, agent_id: agentId } = input;
  const kind = KIND_BY_HOOK_EVENT.get(hookEvent);
  if (kind === undefined) return null;
  // A subagent's prompt is written by its parent agent, not by you, so it
  // resumes nothing. agent_id is read to decide and never sent.
  if (hookEvent === "UserPromptSubmit" && agentId !== undefined && agentId !== null) return null;
  return build(kind, sessionId);
}

/**
 * @param {unknown} payload Parsed `notify` argument.
 * @returns {AgentEvent | null} The event to send, or null to send nothing.
 */
export function fromNotify(payload) {
  if (!isRecord(payload)) return null;
  const kind = KIND_BY_NOTIFY_TYPE.get(payload.type);
  return kind === undefined ? null : build(kind, payload["thread-id"]);
}
