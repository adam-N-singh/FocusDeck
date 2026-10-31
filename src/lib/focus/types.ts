/** Core domain types for FocusDeck. No UI or framework code lives here. */

export type ModeId = "building" | "writing" | "reviewing-agents" | "comms" | "idle";

export type AppId =
  | "editor" | "terminal" | "claude-code" | "cursor-agent"
  | "slack" | "browser-docs" | "browser-x" | "notes" | "calendar";

export type EventKind = "app-switch" | "notification" | "agent-needs-input" | "agent-finished";

export type NotificationClass = "needs-you-now" | "batch-for-later" | "suppress-in-mode";

export interface FocusEvent {
  id: string;
  atMinute: number; // minutes since start of simulated day
  kind: EventKind;
  app: AppId;
  label: string;
  modeAtEvent: ModeId;
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
}

export interface DayMetrics {
  totalSwitches: number;
  /** Switches to an app outside the active mode — the expensive kind. */
  contextSwitches: number;
  interruptions: number;
  /** Interruptions held back by the classifier (batched or suppressed). */
  interruptionsAvoided: number;
  /** Agent loops left waiting for you — the reply thread's "open loops are the disease". */
  openLoops: number;
  longestFocusStretchMinutes: number;
  switchesByApp: Partial<Record<AppId, number>>;
  /** Fired when context switches in a rolling window cross the warning threshold. */
  warningCount: number;
}
