import { classifyNotification } from "./classifier";
import type { FocusEvent, ModeId, NotificationClass } from "./types";

/**
 * The decision stack — where Jev and other models play their part.
 *
 * Layer 1: deterministic rules (classifier.ts). Free, instant, explainable.
 *          If a rule is definitive, no model is called at all.
 * Layer 2: a System One decision model (TypeSafe's Jev is the reference).
 *          Jev is NOT a chat LLM: state in, typed probabilistic answers out
 *          (Choice / Score / Noul questions, each with calibrated confidence),
 *          in ~70-500ms per TypeSafe. It only sees ambiguous residue.
 * Layer 3: a System Two LLM (e.g. Claude) — never per-event. Chunking,
 *          offer phrasing, weekly-review synthesis, proposed new modes.
 * Layer 4: the user. Learned patterns stay inactionable until confirmed
 *          (Hymah North-Star §6), and low-confidence decisions default to
 *          the safe action (batch), never to suppression of a blocked agent.
 */

export type DecisionSource = "rules" | "jev" | "jev-low-confidence";

export interface SystemOneAnswers {
  /** Noul: does this need the user right now? (probability true) */
  needsUserNow: number;
  /** Score: urgency 0..1 */
  urgency: number;
  /** Noul: is this a defection (trap-ward switch) rather than work? */
  isDefection: number;
  /** Overall calibrated confidence 0..1 */
  confidence: number;
}

export interface Decision {
  action: NotificationClass;
  source: DecisionSource;
  confidence: number;
  explanation: string;
  systemOne?: SystemOneAnswers;
}

/** Policy thresholds — our choice, tunable, not the model's (per Jev usage guides). */
export const DECISION_THRESHOLDS = { actNow: 0.8, batchAbove: 0.35 } as const;

/**
 * Mock System One adapter. Deterministic, dependency-free, API-key-free.
 * Swap this function for a real Jev call (state + Choice/Score/Noul questions
 * via the TypeSafe API) without touching the policy code around it.
 * IMPORTANT (Hymah Class E): a real adapter may send event *metadata* only —
 * app, kind, mode, timing. Never notification/message content.
 */
export function mockSystemOne(event: FocusEvent, activeMode: ModeId): SystemOneAnswers {
  const base = { needsUserNow: 0.3, urgency: 0.3, isDefection: 0.1, confidence: 0.6 };
  if (event.kind === "agent-needs-input") {
    return { needsUserNow: activeMode === "building" ? 0.92 : 0.55, urgency: 0.9, isDefection: 0.02, confidence: 0.9 };
  }
  if (event.kind === "agent-finished") {
    return { needsUserNow: activeMode === "reviewing-agents" ? 0.88 : 0.4, urgency: 0.5, isDefection: 0.05, confidence: 0.75 };
  }
  if (event.app === "browser-x") {
    return { needsUserNow: 0.08, urgency: 0.1, isDefection: 0.93, confidence: 0.88 };
  }
  // Plain notification: genuinely ambiguous — low confidence on purpose.
  return { ...base, needsUserNow: 0.45, urgency: 0.45, confidence: 0.45 };
}

/** Is the deterministic rule definitive, or is this the ambiguous residue? */
function isAmbiguous(event: FocusEvent, activeMode: ModeId): boolean {
  if (event.kind === "app-switch") return false;
  if (event.kind === "agent-needs-input") return false; // never model-gated: rules own this
  if (event.kind === "notification" && activeMode === "comms") return true;
  if (event.kind === "agent-finished" && activeMode !== "reviewing-agents") return true;
  return false;
}

/** Full decision: rules first, System One for residue, safe default on doubt. */
export function decide(event: FocusEvent, activeMode: ModeId, systemOne = mockSystemOne): Decision {
  const ruled = classifyNotification(event, activeMode);

  if (!isAmbiguous(event, activeMode)) {
    return {
      action: ruled.classification,
      source: "rules",
      confidence: 1,
      explanation: `Rules decided, no model called. ${ruled.reason}`,
    };
  }

  const answers = systemOne(event, activeMode);
  if (answers.confidence < 0.5) {
    return {
      action: "batch-for-later",
      source: "jev-low-confidence",
      confidence: answers.confidence,
      explanation: "System One was unsure, so the safe default applies: batch for the review moment. Nothing is suppressed on a coin flip.",
      systemOne: answers,
    };
  }
  if (answers.needsUserNow >= DECISION_THRESHOLDS.actNow) {
    return { action: "needs-you-now", source: "jev", confidence: answers.confidence, explanation: "System One: high probability this needs you now, above the act-now threshold.", systemOne: answers };
  }
  return { action: "batch-for-later", source: "jev", confidence: answers.confidence, explanation: "System One: below the act-now threshold, so it batches instead of interrupting.", systemOne: answers };
}
