import { appLabel } from "./apps";
import type { QueueItemKind } from "./offer";
import type { AppId, EventKind, Mode, ModeId } from "./types";

/**
 * Mode-scoped implementation intentions — new in the combination (PRODUCT.md):
 * "When I open X *during Building*, show me…". The user's calm-moment words
 * are kept verbatim and shown back at the hot moment ("You said: …",
 * Hymah North-Star §5); the structured fields only make them matchable.
 */
export type IntentionWhen =
  | "opens-trap" // defection moment: a designated trap app opens outside its mode
  | "agent-blocks" // interruption moment: an agent needs your input
  | "agent-finishes"
  | "notification"
  | "review-moment" // scheduled intent moment (Hymah Spec §3.1, promoted)
  | "enters-mode"; // mode transition

export type OfferTarget =
  | "queue-top" // Hymah's ordering over everything you declared
  | "blocked-agents"
  | "tasks"
  | "intentions"
  | "content"
  | "interests"
  | "batch"; // "batch it until my review moment" — for agent/notification triggers only

export interface ImplementationIntention {
  id: string;
  /** The user's own words, shown back verbatim. Never rewritten by FocusDeck. */
  text: string;
  when: IntentionWhen;
  /** For `opens-trap`: a specific trap app, or undefined for any trap app. */
  app?: AppId;
  /** Mode scope — "any" applies in every mode. For `enters-mode` it is the mode entered. */
  mode: ModeId | "any";
  then: OfferTarget;
  enabled: boolean;
}

export const WHEN_LABELS: Record<IntentionWhen, string> = {
  "opens-trap": "When I open a trap app",
  "agent-blocks": "When an agent blocks on me",
  "agent-finishes": "When an agent finishes",
  notification: "When a notification lands",
  "review-moment": "When my review moment arrives",
  "enters-mode": "When I switch into a mode",
};

export const TARGET_LABELS: Record<OfferTarget, string> = {
  "queue-top": "offer the next thing on my list",
  "blocked-agents": "show me the blocked agent first",
  tasks: "show me my tasks",
  intentions: "show me my pinned intentions",
  content: "offer something short to read",
  interests: "offer one of my declared interests",
  batch: "batch it until my review moment",
};

/** Which queue kinds each target draws from (null = all, in Hymah's order). */
export const TARGET_KINDS: Record<OfferTarget, QueueItemKind[] | null> = {
  "queue-top": null,
  "blocked-agents": ["blocked-agent"],
  tasks: ["task"],
  intentions: ["intention"],
  content: ["content-chunk"],
  interests: ["interest"],
  batch: [],
};

/** Triggers where "batch" is a meaningful response. */
export const BATCHABLE_WHENS: IntentionWhen[] = ["agent-blocks", "agent-finishes", "notification"];

export function eventKindToWhen(kind: EventKind): IntentionWhen | null {
  if (kind === "agent-needs-input") return "agent-blocks";
  if (kind === "agent-finished") return "agent-finishes";
  if (kind === "notification") return "notification";
  return null;
}

export interface TriggerMoment {
  when: IntentionWhen;
  /** The active mode (for `enters-mode`, the mode just entered). */
  mode: ModeId;
  /** The app involved, for `opens-trap`. */
  app?: AppId;
}

/**
 * The most specific enabled intention for this moment, or null. A mode-scoped
 * intention beats an "any mode" one; an app-specific trap intention beats an
 * any-trap one. Ties go to the one declared first.
 */
export function matchIntention(intentions: ImplementationIntention[], moment: TriggerMoment): ImplementationIntention | null {
  let best: ImplementationIntention | null = null;
  let bestScore = -1;
  for (const intention of intentions) {
    if (!intention.enabled || intention.when !== moment.when) continue;
    if (intention.mode !== "any" && intention.mode !== moment.mode) continue;
    if (intention.when === "opens-trap" && intention.app !== undefined && intention.app !== moment.app) continue;
    const score = (intention.mode !== "any" ? 2 : 0) + (intention.app !== undefined ? 1 : 0);
    if (score > bestScore) {
      best = intention;
      bestScore = score;
    }
  }
  return best;
}

/**
 * A first-draft sentence built from the structured fields. The Declare screen
 * offers it as a starting point; the user is expected to rewrite it in their
 * own words, which is what gets stored and shown back.
 */
export function draftIntentionText(
  fields: Pick<ImplementationIntention, "when" | "app" | "mode" | "then">,
  modes: Mode[],
): string {
  const modeLabel = (id: ModeId | "any") => modes.find((m) => m.id === id)?.label ?? id;
  const scope = fields.mode === "any" ? "" : ` during ${modeLabel(fields.mode)}`;
  const opening: Record<IntentionWhen, string> = {
    "opens-trap": `When I open ${fields.app ? appLabel(fields.app) : "a trap app"}${scope}`,
    "agent-blocks": `When an agent blocks on me${scope}`,
    "agent-finishes": `When an agent finishes${scope}`,
    notification: `When a notification lands${scope}`,
    "review-moment": `When my review moment arrives${scope}`,
    "enters-mode": `When I switch into ${fields.mode === "any" ? "a new mode" : modeLabel(fields.mode)}`,
  };
  return `${opening[fields.when]}, ${TARGET_LABELS[fields.then]}.`;
}
