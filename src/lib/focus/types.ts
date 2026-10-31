/** Core domain types for FocusDeck. No UI or framework code lives here. */

/** The five modes FocusDeck ships with. Users may declare more (PRODUCT.md: modes are user-declared first). */
export type BuiltInModeId = "building" | "writing" | "reviewing-agents" | "comms" | "idle";

/**
 * A mode id: a built-in, or one the user declared. `(string & {})` keeps
 * editor autocomplete for the built-ins while allowing user-declared ids.
 */
export type ModeId = BuiltInModeId | (string & {});

export type AppId =
  | "editor" | "terminal" | "claude-code" | "cursor-agent"
  | "slack" | "browser-docs" | "browser-x" | "notes" | "calendar";

export type EventKind = "app-switch" | "notification" | "agent-needs-input" | "agent-finished";

export type NotificationClass = "needs-you-now" | "batch-for-later" | "suppress-in-mode";

/** Where an event came from. Manual test events are logged but never counted in the mirror. */
export type EventOrigin = "sensor" | "demo" | "manual";

export interface FocusEvent {
  id: string;
  atMinute: number; // minutes since start of the day (simulated or local midnight)
  kind: EventKind;
  app: AppId;
  label: string;
  modeAtEvent: ModeId;
  /**
   * Opaque id of the agent/session that raised the event (hashed at the sensor).
   * Structured state from the user's own fleet — never message content (Privacy Class E).
   */
  source?: string;
  origin?: EventOrigin;
}

export interface ClassifiedNotification {
  event: FocusEvent;
  classification: NotificationClass;
  reason: string;
}

export interface Mode {
  id: ModeId;
  label: string;
  /** Apps that belong in this mode — switching to them is not a context switch. */
  allowedApps: AppId[];
  /** Notification kinds that may interrupt in this mode. Others are batched/suppressed. */
  interruptibleBy: EventKind[];
  description: string;
  /**
   * Event kinds the rules hand to the System One model in this mode — the
   * "ambiguous residue" (DECISION-MODELS.md). Never includes agent-needs-input:
   * a blocked agent is never model-gated.
   */
  ambiguous?: EventKind[];
  /**
   * A protected (focus) mode: an interruption here costs a full refocus.
   * In unprotected modes (Reviewing agents, Comms, Idle) attending to an
   * allowed event is the work itself, not an interruption.
   */
  isProtected?: boolean;
  /** Built-in modes can be edited but not deleted (review moments rely on them). */
  builtIn?: boolean;
}

export interface DayMetrics {
  totalSwitches: number;
  /** Switches to an app outside the active mode — the expensive kind. */
  contextSwitches: number;
  /** Events let through while you were in a protected mode — each costs a refocus. */
  interruptions: number;
  /** Events let through in an unprotected mode, where attending to them is the work. */
  attendedInMode: number;
  /** Interruptions held back by the classifier (batched or suppressed). */
  interruptionsAvoided: number;
  /** Agent loops left waiting for you — the reply thread's "open loops are the disease". */
  openLoops: number;
  longestFocusStretchMinutes: number;
  switchesByApp: Partial<Record<AppId, number>>;
  /** Fired when context switches in a rolling window cross the warning threshold. */
  warningCount: number;
}
