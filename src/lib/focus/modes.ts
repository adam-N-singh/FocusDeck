import type { Mode, ModeId } from "./types";

/**
 * Modes — borrowed directly from the quoted post: "custom modes (writing,
 * building, etc.) to help me stay focused", reshaped for agent-heavy work.
 * `reviewing-agents` is the new mode the 506-switch post implies: supervising
 * parallel agents is a mode of its own, not an interruption of Building.
 */
export const MODES: Mode[] = [
  {
    id: "building",
    label: "Building",
    allowedApps: ["editor", "terminal", "browser-docs"],
    interruptibleBy: ["agent-needs-input"],
    description: "Editor + terminal. Only an agent blocked on you may interrupt.",
  },
  {
    id: "writing",
    label: "Writing",
    allowedApps: ["notes", "browser-docs"],
    interruptibleBy: [],
    description: "Notes + docs. Nothing interrupts; everything batches.",
  },
  {
    id: "reviewing-agents",
    label: "Reviewing agents",
    allowedApps: ["claude-code", "cursor-agent", "terminal", "editor"],
    interruptibleBy: ["agent-needs-input", "agent-finished"],
    description: "Supervision is the job here, so agent events are the work — not interruptions.",
  },
  {
    id: "comms",
    label: "Comms",
    allowedApps: ["slack", "browser-x", "calendar"],
    interruptibleBy: ["agent-needs-input", "agent-finished", "notification"],
    description: "Slack, X, calendar. Deliberately leaky — you chose to be reachable.",
  },
  {
    id: "idle",
    label: "Idle / break",
    allowedApps: ["browser-x", "slack"],
    interruptibleBy: ["notification", "agent-finished"],
    description: "Off-task on purpose. Agent finishes can pull you back, gently.",
  },
];

export const MODE_BY_ID: Record<ModeId, Mode> = Object.fromEntries(
  MODES.map((mode) => [mode.id, mode]),
) as Record<ModeId, Mode>;

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
