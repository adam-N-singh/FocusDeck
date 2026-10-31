import { appLabel } from "./apps";
import type { EventKind, Mode, ModeId } from "./types";

/**
 * Modes — borrowed directly from the quoted post: "custom modes (writing,
 * building, etc.) to help me stay focused", reshaped for agent-heavy work.
 * `reviewing-agents` is the new mode the 506-switch post implies: supervising
 * parallel agents is a mode of its own, not an interruption of Building.
 *
 * `ambiguous` lists the residue each mode hands to System One; these lists
 * reproduce the original hard-coded rule exactly (notifications inside Comms,
 * agent finishes anywhere but Reviewing agents).
 */
export const MODES: Mode[] = [
  {
    id: "building",
    label: "Building",
    allowedApps: ["editor", "terminal", "browser-docs"],
    interruptibleBy: ["agent-needs-input"],
    ambiguous: ["agent-finished"],
    isProtected: true,
    builtIn: true,
    description: "Editor + terminal. Only an agent blocked on you may interrupt.",
  },
  {
    id: "writing",
    label: "Writing",
    allowedApps: ["notes", "browser-docs"],
    interruptibleBy: [],
    ambiguous: ["agent-finished"],
    isProtected: true,
    builtIn: true,
    description: "Notes + docs. Nothing interrupts; everything batches.",
  },
  {
    id: "reviewing-agents",
    label: "Reviewing agents",
    allowedApps: ["claude-code", "cursor-agent", "terminal", "editor"],
    interruptibleBy: ["agent-needs-input", "agent-finished"],
    ambiguous: [],
    isProtected: false,
    builtIn: true,
    description: "Supervision is the job here, so agent events are the work — not interruptions.",
  },
  {
    id: "comms",
    label: "Comms",
    allowedApps: ["slack", "browser-x", "calendar"],
    interruptibleBy: ["agent-needs-input", "agent-finished", "notification"],
    ambiguous: ["notification", "agent-finished"],
    isProtected: false,
    builtIn: true,
    description: "Slack, X, calendar. Deliberately leaky — you chose to be reachable.",
  },
  {
    id: "idle",
    label: "Idle / break",
    allowedApps: ["browser-x", "slack"],
    interruptibleBy: ["notification", "agent-finished"],
    ambiguous: ["agent-finished"],
    isProtected: false,
    builtIn: true,
    description: "Off-task on purpose. Agent finishes can pull you back, gently.",
  },
];

/** Mode lookup by id. Typed as a string record so user-declared modes fit too. */
export type ModeMap = Record<string, Mode>;

export const toModeMap = (modes: Mode[]): ModeMap =>
  Object.fromEntries(modes.map((mode) => [mode.id, mode]));

export const MODE_BY_ID: ModeMap = toModeMap(MODES);

/** The mode the review moment switches into. Built-in and undeletable. */
export const REVIEW_MODE_ID: ModeId = "reviewing-agents";

/**
 * Resolve a mode safely. An unknown id (e.g. a deleted custom mode) resolves
 * to a conservative stand-in: protected, nothing interrupts, nothing is
 * model-gated — so a stale reference can only make FocusDeck quieter.
 */
export function resolveMode(modes: ModeMap, id: ModeId): Mode {
  return (
    modes[id] ?? {
      id,
      label: id,
      allowedApps: [],
      interruptibleBy: [],
      ambiguous: [],
      isProtected: true,
      description: "Unknown mode — FocusDeck stays quiet and batches everything.",
    }
  );
}

/** How a mode treats an event kind — the three choices the Declare screen offers. */
export type KindPolicy = "interrupt" | "decide" | "hold";

export function kindPolicy(mode: Mode, kind: EventKind): KindPolicy {
  if (kind !== "agent-needs-input" && mode.ambiguous?.includes(kind)) return "decide";
  return mode.interruptibleBy.includes(kind) ? "interrupt" : "hold";
}

/** Set how a mode treats an event kind. A blocked agent can never be model-gated. */
export function withKindPolicy(mode: Mode, kind: EventKind, policy: KindPolicy): Mode {
  const effective: KindPolicy = kind === "agent-needs-input" && policy === "decide" ? "interrupt" : policy;
  const without = (list: EventKind[] | undefined) => (list ?? []).filter((k) => k !== kind);
  return {
    ...mode,
    interruptibleBy: effective === "interrupt" ? [...without(mode.interruptibleBy), kind] : without(mode.interruptibleBy),
    ambiguous: effective === "decide" ? [...without(mode.ambiguous), kind] : without(mode.ambiguous),
  };
}

const KIND_PHRASE: Record<Exclude<EventKind, "app-switch">, string> = {
  "agent-needs-input": "an agent blocked on you",
  "agent-finished": "an agent finishing",
  notification: "notifications",
};

/** The plain-English rule for a mode, generated from its declared settings. */
export function describeModeRule(mode: Mode): string {
  const kinds = Object.keys(KIND_PHRASE) as (keyof typeof KIND_PHRASE)[];
  const by = (policy: KindPolicy) => kinds.filter((k) => kindPolicy(mode, k) === policy).map((k) => KIND_PHRASE[k]);
  const apps = mode.allowedApps.length > 0 ? mode.allowedApps.map(appLabel).join(", ") : "no apps yet";
  const interrupts = by("interrupt");
  const decides = by("decide");
  const parts = [`Belongs here: ${apps}.`];
  parts.push(interrupts.length > 0 ? `May interrupt: ${interrupts.join(", ")}.` : "Nothing may interrupt.");
  if (decides.length > 0) parts.push(`System One judges: ${decides.join(", ")}.`);
  parts.push("Everything else waits for you, viewable anytime.");
  return parts.join(" ");
}

/** Cost model (minutes of refocus time) — the assumption the stress test varies. */
export const SWITCH_COST_MINUTES = {
  /** Switching inside the active mode (editor -> terminal while Building). */
  inMode: 0.5,
  /** Switching outside the active mode — the classic context switch. */
  context: 4,
  /** Being interrupted by a notification/agent while in a protected mode. */
  interruption: 9,
} as const;

export const WARNING_THRESHOLD = 20; // context switches in a rolling 60-min window
export const WARNING_WINDOW_MINUTES = 60;
