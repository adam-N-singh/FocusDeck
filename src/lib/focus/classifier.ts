import { MODE_BY_ID, resolveMode, type ModeMap } from "./modes";
import type { ClassifiedNotification, FocusEvent, ModeId } from "./types";

/**
 * Deterministic-first classifier — inspired by the thread's best question:
 * "is that deterministic, or are you constantly running [a model]? bit of both?"
 *
 * Layer 1 (this file) is pure rules: mode allow-lists + event kind. It is
 * fast, explainable, and testable. Layer 2 (a System One / Jev-style pass,
 * see decision.ts) only handles the ambiguous residue — it is intentionally
 * NOT in this hot path.
 *
 * `modes` defaults to the built-ins; pass the user's declared modes to
 * classify against their own allow-lists.
 */
export function classifyNotification(
  event: FocusEvent,
  activeMode: ModeId,
  modes: ModeMap = MODE_BY_ID,
): ClassifiedNotification {
  const mode = resolveMode(modes, activeMode);

  if (mode.interruptibleBy.includes(event.kind)) {
    return {
      event,
      classification: "needs-you-now",
      reason: `${mode.label} allows “${event.kind}” to interrupt.`,
    };
  }

  // An agent blocked on your input is never fully suppressed — it becomes an
  // open loop. Batch it loudly instead of letting it ping you in Writing mode.
  if (event.kind === "agent-needs-input") {
    return {
      event,
      classification: "batch-for-later",
      reason: `Agent is blocked, but ${mode.label} is protected — batched as an open loop.`,
    };
  }

  if (event.kind === "agent-finished" || event.kind === "notification") {
    return {
      event,
      classification: "suppress-in-mode",
      reason: `“${event.kind}” does not interrupt ${mode.label}; held for your next mode change.`,
    };
  }

  return { event, classification: "batch-for-later", reason: "Default: batch rather than interrupt." };
}

export function classifyAll(events: FocusEvent[], modes: ModeMap = MODE_BY_ID): ClassifiedNotification[] {
  return events
    .filter((event) => event.kind !== "app-switch")
    .map((event) => classifyNotification(event, event.modeAtEvent, modes));
}
