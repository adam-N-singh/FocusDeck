import { decide, mockSystemOne, type Decision, type SystemOneAdapter } from "./decision";
import { eventKindToWhen, matchIntention, type ImplementationIntention } from "./intentions";
import type { ModeMap } from "./modes";
import type { FocusEvent, ModeId } from "./types";

export const QUIET_FIRST_BUILD_HOUR_MINUTES = 60;

export interface PolicyContext {
  modes: ModeMap;
  intentions: ImplementationIntention[];
  /** A confirmed boundary answer: nothing interrupts the first hour of Building. */
  quietFirstBuildHour: boolean;
  minutesInMode: number;
  systemOneEnabled: boolean;
  /** Guarding paused: FocusDeck steps aside entirely and only logs. */
  paused: boolean;
  systemOne?: SystemOneAdapter;
}

/**
 * The live decision for one event, with the user's own declarations layered
 * onto the decision stack (decision.ts). Order:
 *
 *  0. Guarding paused → pass straight through; logged only.
 *  1. Your own "batch" intentions ("When an agent finishes while I'm building,
 *     batch it…"). Deterministic, quoted back verbatim.
 *  2. Mode allow-lists + event kind, System One for the residue, safe default
 *     on doubt.
 *  3. Confirmed boundary answers (quiet first build hour) can turn a
 *     would-be interruption into a batch.
 *
 * Steps 1 and 3 can only make FocusDeck quieter — never louder than the mode
 * allows — and quieter for a blocked agent always means "batched as an open
 * loop", never suppressed.
 */
export function decideInContext(event: FocusEvent, activeMode: ModeId, ctx: PolicyContext): Decision {
  if (ctx.paused) {
    return {
      action: "needs-you-now",
      source: "paused",
      confidence: 1,
      explanation: "Guarding is paused, so this passed straight through. Logged only — nothing batched, nothing held.",
    };
  }

  const when = eventKindToWhen(event.kind);
  if (when) {
    const intention = matchIntention(ctx.intentions, { when, mode: activeMode });
    if (intention?.then === "batch") {
      return {
        action: "batch-for-later",
        source: "rules",
        confidence: 1,
        intentionId: intention.id,
        explanation: `Your intention decided, no model called. You said: “${intention.text}”`,
      };
    }
  }

  const decision = decide(event, activeMode, ctx.systemOne ?? mockSystemOne, {
    modes: ctx.modes,
    systemOneEnabled: ctx.systemOneEnabled,
  });

  const inQuietHour =
    ctx.quietFirstBuildHour && activeMode === "building" && ctx.minutesInMode < QUIET_FIRST_BUILD_HOUR_MINUTES;
  if (inQuietHour && decision.action === "needs-you-now") {
    return {
      ...decision,
      action: "batch-for-later",
      source: "rules",
      confidence: 1,
      explanation: `You asked me to stay quiet during your first build hour (${Math.round(ctx.minutesInMode)}m in), so this waits for your review moment.`,
    };
  }
  return decision;
}
