import type { FocusEvent } from "./types";

/**
 * A hand-authored day that mirrors the X post beat-for-beat, so the story is
 * testable: Building -> agent finishes in Slack -> Claude Code needs an answer
 * -> check it -> open X while the next run finishes.
 */
export const POST_DAY_EVENTS: FocusEvent[] = [
  { id: "p1", atMinute: 0, kind: "app-switch", app: "editor", label: "Start building", modeAtEvent: "building" },
  { id: "p2", atMinute: 18, kind: "app-switch", app: "terminal", label: "Run tests (in-mode)", modeAtEvent: "building" },
  { id: "p3", atMinute: 34, kind: "agent-finished", app: "slack", label: "Agent finished — reported in Slack", modeAtEvent: "building" },
  { id: "p4", atMinute: 35, kind: "app-switch", app: "slack", label: "Switch to Slack to read it", modeAtEvent: "building" },
  { id: "p5", atMinute: 41, kind: "agent-needs-input", app: "claude-code", label: "Claude Code session needs an answer", modeAtEvent: "building" },
  { id: "p6", atMinute: 42, kind: "app-switch", app: "claude-code", label: "Switch to Claude Code", modeAtEvent: "building" },
  { id: "p7", atMinute: 48, kind: "app-switch", app: "browser-x", label: "Open X while the next run finishes", modeAtEvent: "building" },
  { id: "p8", atMinute: 55, kind: "app-switch", app: "editor", label: "Back to editor", modeAtEvent: "building" },
  { id: "p9", atMinute: 70, kind: "notification", app: "slack", label: "Slack notification (batched in Building)", modeAtEvent: "building" },
  { id: "p10", atMinute: 90, kind: "agent-needs-input", app: "cursor-agent", label: "Cursor agent blocked on a choice", modeAtEvent: "writing" },
];
